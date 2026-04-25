import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartHandshakeIcon, MenuIcon, XIcon, LogOutIcon, UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  const navLinks = [
    {
      name: 'Home',
      path: '/'
    },
    {
      name: 'Explore',
      path: '/explore'
    },
    {
      name: 'How It Works',
      path: '/#how-it-works'
    }
  ];

  const handleLogout = () => {
    logout();
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-surface-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-brand-600 text-white p-2 rounded-xl group-hover:bg-brand-700 transition-colors">
              <HeartHandshakeIcon className="w-6 h-6" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-surface-900">
              Gambia<span className="text-brand-600">Fund</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <div className="flex gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.path}
                  className="text-sm font-semibold text-surface-600 hover:text-brand-600 transition-colors">
                  {link.name}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-4 border-l border-surface-200 pl-6">
              {user ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs text-surface-500">Logged in as</p>
                      <p className="text-sm font-semibold text-surface-900">{user.fullName}</p>
                    </div>
                  </div>
                  <div className="h-6 w-px bg-surface-200"></div>
                  {user.role === 'ADMIN' && (
                    <Link
                      to="/admin"
                      className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                      Admin Panel
                    </Link>
                  )}
                  {user.role !== 'ADMIN' && (
                    <Link
                      to="/dashboard"
                      className="text-sm font-semibold text-surface-600 hover:text-brand-600">
                      Dashboard
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="text-sm font-semibold text-surface-600 hover:text-red-600 flex items-center gap-2">
                    <LogOutIcon className="w-4 h-4" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm font-semibold text-surface-600 hover:text-brand-600">
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    className="text-sm font-semibold text-surface-600 hover:text-brand-600">
                    Register
                  </Link>
                  <Link
                    to="/dashboard"
                    className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm hover:shadow">
                    Start a Campaign
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-surface-600"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? (
              <XIcon className="w-6 h-6" />
            ) : (
              <MenuIcon className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-surface-200 absolute w-full">
          <div className="px-4 pt-2 pb-6 space-y-4">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-base font-semibold text-surface-700 py-2">
                {link.name}
              </Link>
            ))}
            <div className="pt-4 border-t border-surface-100 flex flex-col gap-3">
              {user ? (
                <>
                  <div className="px-4 py-2">
                    <p className="text-xs text-surface-500">Logged in as</p>
                    <p className="text-sm font-semibold text-surface-900">{user.fullName}</p>
                    {user.role === 'ADMIN' && (
                      <p className="text-xs text-brand-600 font-semibold">Admin</p>
                    )}
                  </div>
                  {user.role === 'ADMIN' && (
                    <Link
                      to="/admin"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block text-center py-3 rounded-xl font-semibold text-brand-600 bg-brand-50">
                      Admin Panel
                    </Link>
                  )}
                  {user.role !== 'ADMIN' && (
                    <Link
                      to="/dashboard"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block text-center py-3 rounded-xl font-bold text-white bg-brand-600">
                      Dashboard
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="block w-full text-center py-3 rounded-xl font-semibold text-surface-700 bg-surface-100">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block text-center py-3 rounded-xl font-semibold text-surface-700 bg-surface-100">
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block text-center py-3 rounded-xl font-semibold text-surface-700 bg-surface-100">
                    Register
                  </Link>
                  <Link
                    to="/dashboard"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block text-center py-3 rounded-xl font-bold text-white bg-brand-600">
                    Start a Campaign
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
