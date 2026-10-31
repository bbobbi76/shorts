import React from 'react';
import { useEffect, useRef, type ReactNode } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { type Content, ServiceError, statusLabels } from '../domain/model';

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  useEffect(() => { const previousFocus = document.activeElement as HTMLElement | null; const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); }; }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose?.(); }}><div className="modal-heading"><h2 id={titleId}>{title}</h2>{onClose && <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X/></button>}</div>{children}</dialog>;
}

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  const id = React.useId();
  const description = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className={`field ${error ? 'has-error' : ''}`}><label htmlFor={id}>{label}{required && <span className="required" aria-hidden="true">*</span>}</label>{React.isValidElement<Record<string, unknown>>(children) ? React.cloneElement(children, { id, 'aria-required': required || undefined, 'aria-invalid': !!error || undefined, 'aria-describedby': description }) : children}{hint && <p id={`${id}-hint`} className="help">{hint}</p>}{error && <p id={`${id}-error`} className="field-error">{error}</p>}</div>;
}

export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={24}/>불러오는 중…</div>; }

export function ErrorBox({ error, retry }: { error: ServiceError | null; retry?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const detail = error?.fields.join('|');
  useEffect(() => { if (error) ref.current?.focus(); }, [error?.message, detail]);
  return error && <div ref={ref} tabIndex={-1} className="error-box" role="alert"><strong>{error.message}</strong>{error.fields.length > 0 && <ul>{error.fields.map(text => <li key={text}>{text}</li>)}</ul>}{retry && <button type="button" className="text-button" onClick={retry}>다시 시도</button>}</div>;
}

export function StatusBadge({ status }: { status: Content['status'] }) { return <span className={`badge ${status.toLowerCase()}`}><i/>{statusLabels[status]}</span>; }

export function PageHeading({ title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1><p className="page-description">{description}</p></div>{children}</div>; }

export function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) { return <div className="section-heading"><span className="section-number">{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>; }
