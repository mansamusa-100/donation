import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function SiteArticleLayout({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-50 py-12 md:py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="mb-8">
          <Link to="/" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            ← Back to home
          </Link>
        </nav>
        <header className="mb-10">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-surface-900 tracking-tight">
            {title}
          </h1>
          {subtitle ? <p className="mt-3 text-lg text-surface-600 leading-relaxed">{subtitle}</p> : null}
        </header>
        <div className="space-y-6 text-surface-700 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
