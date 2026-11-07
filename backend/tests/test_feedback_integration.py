"""Main app routing and learner privacy against isolated SQLite only."""
from unittest.mock import Mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from ai.practice_feedback import get_feedback_db
from ai.rubric import grade_request
from app.database import Base
from app.main import app
from app.models import Category, User, Content, Course, Practice
from app.ui_api import content_out
from app.ui_contract import PublicContentOut


def test_main_feedback_uses_private_database_criteria(monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([Category(id=91, name='통합검증', category_type='COMMON'),
                    User(id=91, email='integration@example.invalid', password_hash='unused', name='테스트')])
        db.flush()
        db.add(Course(id=91, title='과정', category_id=91, created_by=91, status='PUBLISHED'))
        db.flush()
        content = Content(id=91, title='영상', course_id=91, created_by=91, status='PUBLISHED')
        db.add(content)
        db.flush()
        practice = Practice(id=192, content_id=91, title='조건 합계',
            instruction='SUMIF 함수를 사용하여 영업팀 매출 합계를 구하세요.',
            answer_formula='=SUMIF(A:A,"영업팀",B:B)', expected_result='120',
            result_type='NUMBER', tolerance=0, required_function='SUMIF')
        db.add(practice)
        db.commit()
        public = PublicContentOut.model_validate(content_out(db, content, True)).model_dump()
        assert public['practiceId'] == 192  # not the content ID
        assert public['practiceTitle'] == '조건 합계'
        for key in ('practiceSettings', 'answer_formula', 'expected_result', 'required_function', 'evaluation_criteria'):
            assert key not in public
        assert practice.answer_formula not in str(public)
        evaluator = Mock(side_effect=lambda request: grade_request(request).feedback)
        monkeypatch.setenv('FEEDBACK_PROVIDER', 'gemini')
        monkeypatch.setenv('GEMINI_API_KEY', 'test-only-no-network')
        monkeypatch.setattr('app.routers.ai_feedback.evaluate_answer', evaluator)
        app.dependency_overrides[get_feedback_db] = lambda: db
        try:
            client = TestClient(app)  # no lifespan / no production MySQL
            assert client.post('/api/ai/feedback', json={'learner_answer': 'x'}).status_code == 422
            for answer, status, score in [
                ('=SUMIF(A:A,"영업팀",B:B)', 'correct', 100),
                ('=SUMIF(A:A,"영업팀")', 'partially_correct', 65),
                ('=AVERAGE(B:B)', 'incorrect', 0),
            ]:
                response = client.post('/api/ai/feedback', json={
                    'practice_id': public['practiceId'], 'learner_answer': answer,
                    'expected_answer': 'client tampering'})
                assert response.status_code == 200, response.text
                assert (response.json()['status'], response.json()['score']) == (status, score)
                assert evaluator.call_args.args[0].expected_answer == practice.answer_formula
            calls = evaluator.call_count
            practice.answer_formula = None
            db.flush()
            result = client.post('/api/ai/feedback', json={'practice_id': 192, 'learner_answer': '=SUM(A:A)'}).json()
            assert result['status'] == 'needs_review' and result['score'] is None
            assert evaluator.call_count == calls
            practice.answer_formula = '=SUMIF(A:A,"영업팀",B:B)'
            db.flush()
            monkeypatch.delenv('GEMINI_API_KEY')
            assert client.post('/api/ai/feedback', json={'practice_id': 192, 'learner_answer': practice.answer_formula}).status_code == 503
            monkeypatch.setenv('GEMINI_API_KEY', 'test-only-no-network')
            evaluator.side_effect = RuntimeError('test provider error')
            assert client.post('/api/ai/feedback', json={'practice_id': 192, 'learner_answer': practice.answer_formula}).status_code == 502
            content.status = 'HIDDEN'
            db.flush()
            assert client.post('/api/ai/feedback', json={'practice_id': 192, 'learner_answer': 'x'}).status_code == 404
        finally:
            app.dependency_overrides.pop(get_feedback_db, None)
    engine.dispose()
