import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HandHeartIcon,
  HeartHandshakeIcon,
  LightbulbIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SproutIcon,
  SunriseIcon,
  UsersIcon
} from 'lucide-react';
import { BRAND_NAME } from '../lib/brand';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6 }
};

export function AboutPage() {
  return (
    <div className="min-h-screen bg-surface-50">
      {/* Hero */}
      <section className="relative pt-20 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-brand-50/60 -z-10" />
        <div className="absolute top-0 left-0 -translate-y-1/4 -translate-x-1/3 w-[700px] h-[700px] bg-brand-200/30 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 right-0 translate-y-1/3 translate-x-1/4 w-[600px] h-[600px] bg-amber-100/40 rounded-full blur-3xl -z-10" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}>
            <span className="inline-block py-1 px-3 rounded-full bg-brand-100 text-brand-700 text-sm font-bold mb-6">
              Our story
            </span>
            <h1 className="text-4xl md:text-6xl font-display font-extrabold text-surface-900 tracking-tight mb-6 text-balance">
              Every act of giving
              <br />
              <span className="text-brand-600">leaves a blessing behind</span>
            </h1>
            <p className="text-lg md:text-xl text-surface-600 leading-relaxed text-balance max-w-2xl mx-auto">
              <em>Barakah</em> — the quiet abundance that grows when something is given with a sincere
              heart. It is the name we chose, and the promise we keep: that no kindness placed here
              is ever wasted.
            </p>
          </motion.div>
        </div>
      </section>

      {/* The story */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="space-y-6 text-lg text-surface-700 leading-relaxed">
            <h2 className="font-display text-3xl font-bold text-surface-900">Why we exist</h2>
            <p>
              Somewhere tonight, a mother is counting coins for a hospital bill. A student is one
              term of school fees away from a different life. A shopkeeper is one small loan away
              from feeding a whole street. Their stories are not rare — they are everywhere. What is
              rare is a bridge between the people who need help and the many, many people who would
              gladly give it.
            </p>
            <p>
              {BRAND_NAME} was born to be that bridge. Not a marketplace, not a charity — a meeting
              place. A place where a need can be spoken plainly, and answered generously. Where the
              distance between <em>"I wish I could help"</em> and <em>"I just did"</em> is a single
              tap on the phone already in your hand.
            </p>
            <p>
              We believe generosity is not a luxury of the wealthy. It is a habit of the
              willing — a dalasi here, a hundred there, gathered like raindrops until a river moves.
              Our work is simply to make sure every drop arrives where it was meant to go.
            </p>
          </motion.div>
        </div>
      </section>

      {/* What we do */}
      <section className="py-20 bg-white border-y border-surface-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-surface-900 mb-4">
              What we do
            </h2>
            <p className="text-lg text-surface-600">
              We make raising funds simple enough for anyone with a story, and giving easy enough
              for anyone with a heart.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: SunriseIcon,
                title: 'Start in minutes',
                text: 'Tell your story, set your goal, add your photos. No paperwork mountains, no gatekeepers — your campaign can be live the same day it is approved.'
              },
              {
                icon: SmartphoneIcon,
                title: 'Give from anywhere',
                text: 'Mobile wallets and bank transfers, right from the device in your pocket. Giving should never be harder than the need it answers.'
              },
              {
                icon: ShieldCheckIcon,
                title: 'Trust, built in',
                text: 'Every campaign is reviewed by real people before it goes public. Verification, moderation, and a full audit trail keep generosity safe.'
              },
              {
                icon: HandHeartIcon,
                title: 'Funds that arrive',
                text: 'Withdrawals are tracked from request to payout, with clear fees and no surprises. What was given in trust is delivered in full view.'
              }
            ].map(({ icon: Icon, title, text }) => (
              <motion.div
                key={title}
                {...fadeUp}
                className="bg-surface-50 rounded-2xl border border-surface-200 p-6 hover:shadow-warm hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-display font-bold text-surface-900 text-lg mb-2">{title}</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The problem we solve */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeUp} className="space-y-5 text-surface-700 leading-relaxed">
              <h2 className="font-display text-3xl font-bold text-surface-900">
                The problem we set out to solve
              </h2>
              <p>
                For too long, raising money meant standing at a crossroads: knock on doors, post in
                group chats, hope the right person sees it before the deadline passes. Generosity
                was abundant — but scattered, slow, and hard to trust.
              </p>
              <p>
                We gathered all of it into one place. One page that carries your whole story. One
                link that travels further than your feet ever could. One ledger that shows every
                donor their gift landed, and shows every organizer exactly what they can withdraw,
                when, and how.
              </p>
              <p className="font-semibold text-surface-900">
                Fundraising should feel like being carried by your community — not like carrying it
                alone.
              </p>
            </motion.div>

            <motion.div {...fadeUp} className="space-y-4">
              {[
                {
                  icon: UsersIcon,
                  title: 'For organizers',
                  text: 'A dignified way to ask — with verification that earns trust and tools that respect your time.'
                },
                {
                  icon: HeartHandshakeIcon,
                  title: 'For donors',
                  text: 'Certainty that your gift reached a real person, a real cause, a real moment of need.'
                },
                {
                  icon: SproutIcon,
                  title: 'For communities',
                  text: 'Small gifts, gathered well, become school fees, medicine, shelter, and new beginnings.'
                }
              ].map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="flex gap-4 bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-surface-900">{title}</h3>
                    <p className="text-sm text-surface-600 leading-relaxed mt-1">{text}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-surface-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div {...fadeUp}>
            <LightbulbIcon className="w-10 h-10 text-brand-400 mx-auto mb-6" />
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-10">What we believe</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-left">
            {[
              {
                title: 'Transparency is kindness',
                text: 'Clear fees, visible progress, honest accounting. Trust is not asked for — it is shown.'
              },
              {
                title: 'Dignity in asking',
                text: 'Needing help is human. We build a place where asking is met with respect, never shame.'
              },
              {
                title: 'Every gift matters',
                text: 'There is no donation too small. A river never asks how big each raindrop was.'
              }
            ].map(({ title, text }) => (
              <motion.div key={title} {...fadeUp} className="space-y-2">
                <h3 className="font-display font-bold text-lg text-brand-400">{title}</h3>
                <p className="text-surface-300 text-sm leading-relaxed">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div {...fadeUp}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-surface-900 mb-4 text-balance">
              The next story could be one you helped write
            </h2>
            <p className="text-lg text-surface-600 mb-10 text-balance">
              Browse the causes waiting for a hand, or start a campaign of your own. Either way, you
              leave a little barakah behind.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/explore"
                className="w-full sm:w-auto px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all">
                Explore campaigns
              </Link>
              <Link
                to="/dashboard"
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-surface-50 text-surface-900 rounded-xl font-bold text-lg shadow-sm border border-surface-200 transition-all">
                Start a campaign
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
