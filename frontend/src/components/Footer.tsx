import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FacebookIcon,
  TwitterIcon,
  InstagramIcon } from
'lucide-react';
import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_NAME_PRIMARY, SUPPORT_PHONES, SUPPORT_WHATSAPP, telHref, whatsappHref } from '../lib/brand';

export function Footer() {
  const { user } = useAuth();
  return (
    <footer className="bg-surface-900 text-surface-300 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2 text-white">
              <img src={BRAND_LOGO_SRC} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
              <span className="font-display font-bold text-2xl tracking-tight">
                {BRAND_NAME_PRIMARY}
                <span className="text-brand-500">Fund</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-surface-400">
              {BRAND_NAME} is a crowdfunding platform for meaningful causes, empowering communities, funding dreams,
              and providing relief when it matters most.
            </p>
            <div className="flex gap-4 pt-2">
              <a href="#" className="hover:text-white transition-colors">
                <FacebookIcon className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors">
                <TwitterIcon className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors">
                <InstagramIcon className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-display font-bold mb-4">Platform</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  to="/explore"
                  className="hover:text-brand-400 transition-colors">
                  Explore Campaigns
                </Link>
              </li>
              <li>
                {user?.role === 'ADMIN' ? (
                  <Link to="/admin" className="hover:text-brand-400 transition-colors">
                    Admin dashboard
                  </Link>
                ) : (
                  <Link to="/dashboard" className="hover:text-brand-400 transition-colors">
                    Dashboard
                  </Link>
                )}
              </li>
              <li>
                <Link
                  to="/#how-it-works"
                  className="hover:text-brand-400 transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-brand-400 transition-colors">
                  Pricing & Fees
                </Link>
              </li>
              <li>
                <Link to="/track-bank-transfer" className="hover:text-brand-400 transition-colors">
                  Track bank transfer
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-brand-400 transition-colors">
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-display font-bold mb-4">Support</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/help" className="hover:text-brand-400 transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link to="/trust" className="hover:text-brand-400 transition-colors">
                  Trust & Safety
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-brand-400 transition-colors">
                  Contact Us
                </Link>
              </li>
              {SUPPORT_PHONES.map((phone) => (
                <li key={phone}>
                  <a href={telHref(phone)} className="hover:text-brand-400 transition-colors">
                    {phone}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={whatsappHref(SUPPORT_WHATSAPP)}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-400 transition-colors"
                >
                  WhatsApp {SUPPORT_WHATSAPP}
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-white font-display font-bold mb-4">
              Stay Updated
            </h4>
            <p className="text-sm mb-4 text-surface-400">
              Get inspiring stories and platform updates delivered to your
              inbox.
            </p>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="Email address"
                className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:border-brand-500 text-white" />
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <div className="pt-8 border-t border-surface-800 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-surface-500">
          <p>
            © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link to="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
