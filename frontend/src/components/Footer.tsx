import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  HeartHandshakeIcon,
  FacebookIcon,
  TwitterIcon,
  InstagramIcon } from
'lucide-react';

export function Footer() {
  const { user } = useAuth();
  return (
    <footer className="bg-surface-900 text-surface-300 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2 text-white">
              <HeartHandshakeIcon className="w-8 h-8 text-brand-500" />
              <span className="font-display font-bold text-2xl tracking-tight">
                Gambia<span className="text-brand-500">Fund</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-surface-400">
              The Gambia's first dedicated crowdfunding platform. Empowering
              communities, funding dreams, and providing relief when it matters
              most.
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
                <a href="#" className="hover:text-brand-400 transition-colors">
                  Pricing & Fees
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-display font-bold mb-4">Support</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="#" className="hover:text-brand-400 transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-400 transition-colors">
                  Trust & Safety
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-400 transition-colors">
                  Contact Us
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
            Made with heart in The Gambia. Copyright {new Date().getFullYear()}{' '}
            GambiaFund.
          </p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Privacy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
