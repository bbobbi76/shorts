"""Conservative structural rubric, not an Excel execution engine.

Only supported formula structures can be compared. Alternative proofs of
equivalence, workbook-dependent results and unknown syntax require review.
"""
from dataclasses import dataclass
from decimal import Decimal, DecimalException, localcontext
import re

from .schemas import FeedbackResponse, TrustedFeedbackRequest

SUPPORTED = {"SUMIF", "SUMIFS", "IF", "SUM", "AVERAGE", "COUNT"}
TOKEN = re.compile(
    r'\s*("(?:[^\"]|"")*"|\$?[A-Za-z]{1,3}(?:\$?[1-9][0-9]*)?'
    r'(?::\$?[A-Za-z]{1,3}(?:\$?[1-9][0-9]*)?)?(?![A-Za-z_0-9])'
    r'|[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?'
    r'|>=|<=|<>|[=><+*/^&(),%-])'
)
PRECEDENCE = {"=":1, "<>":1, ">":1, "<":1, ">=":1, "<=":1,
              "&":2, "+":3, "-":3, "*":4, "/":4, "^":5}


class FormulaUnsupported(ValueError):
    pass


def parse_formula(text):
    if not text.startswith("=") or len(text) > 2000:
        raise FormulaUnsupported("수식 형식")
    tokens, pos = [], 1
    while pos < len(text):
        if not text[pos:].strip():
            break
        match = TOKEN.match(text, pos)
        if not match:
            raise FormulaUnsupported("지원하지 않는 구문")
        tokens.append(match.group(1))
        pos = match.end()
    if len(tokens) > 250:
        raise FormulaUnsupported("수식 복잡도")
    index = 0

    def expression(minimum=0, depth=0):
        nonlocal index
        if depth > 24 or index >= len(tokens):
            raise FormulaUnsupported("불완전하거나 복잡한 수식")
        token = tokens[index]
        index += 1
        if token in ("+", "-"):
            node = ("unary", token, expression(6, depth+1))
        elif token == "(":
            node = expression(0, depth+1)
            if index >= len(tokens) or tokens[index] != ")":
                raise FormulaUnsupported("괄호")
            index += 1
        elif token.startswith('"'):
            node = ("text", token[1:-1].replace('""', '"'))
        elif re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', token):
            node = ("number", Decimal(token))
        elif re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', token) and index < len(tokens) and tokens[index] == "(":
            name = token.upper()
            if name not in SUPPORTED:
                raise FormulaUnsupported("지원하지 않는 함수")
            index += 1
            args = []
            while index < len(tokens) and tokens[index] != ")":
                args.append(expression(0, depth+1))
                if index < len(tokens) and tokens[index] == ",":
                    index += 1
                    if index >= len(tokens) or tokens[index] == ")":
                        raise FormulaUnsupported("빈 인수")
                else:
                    break
            if index >= len(tokens) or tokens[index] != ")":
                raise FormulaUnsupported("함수 괄호")
            index += 1
            node = ("call", name, tuple(args))
        elif re.fullmatch(r'\$?[A-Za-z]{1,3}(?:\$?[1-9][0-9]*)?(?::\$?[A-Za-z]{1,3}(?:\$?[1-9][0-9]*)?)?', token):
            # Bare words such as ABC might be named ranges: do not infer their meaning.
            if ":" not in token and not any(c.isdigit() for c in token):
                raise FormulaUnsupported("이름 정의 참조")
            node = ("reference", token.upper())
        else:
            raise FormulaUnsupported("지원하지 않는 표현식")
        while index < len(tokens) and tokens[index] in PRECEDENCE and PRECEDENCE[tokens[index]] >= minimum:
            operator = tokens[index]
            index += 1
            node = ("binary", operator, node, expression(PRECEDENCE[operator]+1, depth+1))
        return node

    result = expression()
    if index != len(tokens):
        raise FormulaUnsupported("남은 토큰")
    return result


def function_requirement_issue(instruction, required):
    """NULL means no stored restriction, not a missing mandatory rubric field.

Explicit, detectable contradictions in instruction are held for author review.
This does not claim to fully parse arbitrary natural-language requirements.
"""
    mentioned = set(re.findall(
        r'\b(SUMIFS?|IF|SUM|AVERAGE|COUNT)\s*(?:함수(?:를|로)?\s*)?(?:사용|이용|활용)',
        instruction.upper()))
    if mentioned and (not required or mentioned != {required.upper()}):
        return "지시문과 저장된 필수 함수 기준 불일치"
    if required and re.search(r'함수\s*(?:제한\s*없|무관)', instruction):
        return "함수 제한 지시문 충돌"
    return None


def review(reason):
    return FeedbackResponse(status="needs_review", score=None, good_points=[], improvement_points=[],
        corrected_answer="", explanation=reason,
        next_practice="담당자에게 평가 기준과 답안을 확인한 뒤 다시 제출해 주세요.")


@dataclass
class RubricGrade:
    feedback: FeedbackResponse
    checks: list[dict]


def _check(key, passed, expected, observed, points):
    return dict(criterion_id=key, passed=passed, expected=expected, observed=observed, points=points)


def _feedback(request, checks, score):
    status = "correct" if score == 100 else "incorrect" if score == 0 else "partially_correct"
    def label(key):
        return {"function":"비교 함수", "argument_count":"인수 개수", "result":"제출 결과"}.get(
            key, "인수 " + key.removeprefix("argument_"))
    good = [f"{label(c['criterion_id'])}: 기준 {c['expected']} / 제출 {c['observed']} — 일치" for c in checks if c["passed"]]
    bad = [f"{label(c['criterion_id'])}: 기준 {c['expected']} / 제출 {c['observed']} — 불일치" for c in checks if not c["passed"]]
    return RubricGrade(FeedbackResponse(status=status, score=score, good_points=good,
        improvement_points=bad, corrected_answer=request.expected_answer,
        explanation=("서버 루브릭으로 수식의 함수·인수 구조를 비교했습니다. Excel을 실행하거나 계산 결과를 검증하지 않았습니다."
                     if request.evaluation_criteria.answer_type == "FORMULA" else
                     "서버에 저장된 기대 결과와 결과 유형·허용 오차로 제출 결과값을 비교했습니다."),
        next_practice="조건과 범위를 한 가지씩 바꾸어 같은 유형의 과제를 연습해 보세요."), checks)


def valid_function_arities(node):
    if not isinstance(node, tuple):
        return True
    if node and node[0] == "call":
        name, args = node[1], node[2]
        valid = ((name == "SUMIF" and len(args) in (2,3)) or
                 (name == "SUMIFS" and len(args) >= 3 and len(args) % 2 == 1) or
                 (name == "IF" and len(args) in (2,3)) or
                 (name in {"SUM", "AVERAGE", "COUNT"} and len(args) >= 1))
        return valid and all(valid_function_arities(arg) for arg in args)
    return all(valid_function_arities(child) for child in node)


def grade_request(request: TrustedFeedbackRequest) -> RubricGrade:
    criteria = request.evaluation_criteria
    if criteria.answer_type == "RESULT":
        expected, observed = request.expected_answer, request.learner_answer
        if criteria.result_type == "TEXT":
            passed = observed == expected
        else:
            try:
                a, b, tolerance = Decimal(observed), Decimal(expected), Decimal(criteria.tolerance)
                if not all(n.is_finite() and abs(n.adjusted()) <= 10000 for n in (a,b,tolerance)) or tolerance < 0:
                    raise ValueError("invalid numeric comparison")
                with localcontext() as context:
                    context.prec = 20050
                    passed = abs(a-b) <= tolerance
            except (DecimalException, ValueError, TypeError):
                return RubricGrade(review("숫자 결과값 또는 허용 오차를 안전하게 비교할 수 없어 보류합니다."), [])
        expected_evidence = expected if criteria.result_type == "TEXT" else f"{expected} (허용 오차 {criteria.tolerance})"
        check = _check("result", passed, expected_evidence, observed, 100)
        return _feedback(request, [check], 100 if passed else 0)

    try:
        expected, observed = parse_formula(request.expected_answer), parse_formula(request.learner_answer)
    except (FormulaUnsupported, DecimalException, RecursionError):
        return RubricGrade(review("지원하는 수식 구조로 근거를 확인할 수 없어 평가를 보류합니다."), [])
    if expected[0] != "call" or observed[0] != "call":
        return RubricGrade(review("함수 호출 이외의 풀이 동등성은 확인할 수 없어 보류합니다."), [])
    name, required = expected[1], (criteria.required_function or "").upper()
    if required and name != required:
        return RubricGrade(review("모범 수식의 최상위 함수와 필수 함수 기준이 달라 검토가 필요합니다."), [])
    args, submitted = expected[2], observed[2]
    if not valid_function_arities(expected):
        return RubricGrade(review("모범 수식의 인수 구성이 유효하지 않아 보류합니다."), [])
    if not valid_function_arities(observed):
        return RubricGrade(review("제출 수식의 인수 구성을 확인할 수 없어 보류합니다."), [])
    if observed[1] != name:
        if not required:
            return RubricGrade(review("함수 제한이 없는 과제의 다른 풀이는 동등성을 검토해야 합니다."), [])
        # A nested use of the required function may still satisfy the requirement.
        def contains(node):
            return isinstance(node, tuple) and ((len(node)>1 and node[0]=="call" and node[1]==required)
                or any(contains(child) for child in node))
        if contains(observed):
            return RubricGrade(review("중첩 함수 풀이의 동등성을 확인할 수 없어 보류합니다."), [])
        return _feedback(request, [_check("function", False, required, observed[1], 100)], 0)
    checks = [_check("function", True, name, observed[1], 25),
              _check("argument_count", len(args)==len(submitted), str(len(args)), str(len(submitted)), 15)]
    # Per-argument points total exactly 60 even when 60 is not divisible by arity.
    for index, argument in enumerate(args):
        value = submitted[index] if index < len(submitted) else None
        checks.append(_check(f"argument_{index+1}", argument==value,
            repr(argument), repr(value) if value is not None else "누락",
            60//len(args) + (1 if index < 60 % len(args) else 0)))
    return _feedback(request, checks, sum(c["points"] for c in checks if c["passed"]))


def validate_model_assessment(request, candidate, grade):
    """Only server-proven evidence is rendered. Model prose never becomes facts."""
    from .schemas import ProviderAssessment
    assessment = ProviderAssessment.model_validate(candidate)
    if assessment.status == "needs_review":
        return review("AI가 평가 근거를 확정하지 못해 검토를 요청했습니다.")
    expected_checks = [{k:v for k,v in c.items() if k != "points"} for c in grade.checks]
    actual_checks = [c.model_dump() for c in assessment.criterion_checks]
    if (assessment.status != grade.feedback.status or assessment.score != grade.feedback.score
            or assessment.corrected_answer != grade.feedback.corrected_answer
            or actual_checks != expected_checks):
        return review("AI 판정·점수·항목별 근거가 서버 루브릭과 일치하지 않아 보류합니다.")
    return grade.feedback
