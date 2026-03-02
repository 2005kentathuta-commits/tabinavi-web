import { createElement } from 'react';

function cx(...tokens) {
  return tokens.filter(Boolean).join(' ');
}

export function AppShell({ children, className = '', style = undefined }) {
  return (
    <main className={cx('ui-app-shell', className)} style={style}>
      {children}
    </main>
  );
}

export function Container({ children, className = '', size = 'lg', as: Tag = 'div' }) {
  return createElement(Tag, { className: cx('ui-container', `ui-container-${size}`, className) }, children);
}

export function Stack({ children, className = '', gap = 'md', as: Tag = 'div' }) {
  return createElement(Tag, { className: cx('ui-stack', `ui-stack-${gap}`, className) }, children);
}

export function Grid({ children, className = '', cols = 'auto', as: Tag = 'div' }) {
  return createElement(Tag, { className: cx('ui-grid', `ui-grid-${cols}`, className) }, children);
}

export function Card({ children, className = '', as: Tag = 'section', tone = 'default' }) {
  return createElement(Tag, { className: cx('ui-card', `ui-card-${tone}`, className) }, children);
}

export function Button({
  children,
  className = '',
  tone = 'primary',
  as: Tag = 'button',
  type = 'button',
  ...props
}) {
  const baseProps = {
    className: cx('ui-button', `ui-button-${tone}`, className),
    ...props,
  };
  if (Tag === 'button') {
    baseProps.type = type;
  }
  return createElement(Tag, baseProps, children);
}

export function Input({ className = '', as: Tag = 'input', ...props }) {
  return createElement(Tag, {
    className: cx('ui-input', className),
    ...props,
  });
}
