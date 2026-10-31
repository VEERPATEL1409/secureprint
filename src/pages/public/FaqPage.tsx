import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, ShieldCheck, Printer, Clock, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FAQItem {
  q: string;
  a: string;
  category: string;
}

const FAQS: FAQItem[] = [
  {
    category: 'Customers',
    q: 'Do I need to download an app or create an account to print?',
    a: 'No! SecurePrint is 100% web-based. Simply scan the QR code at any participating print counter with your regular phone camera, upload your document in Safari or Chrome, and tell the shopkeeper your 6-digit desk token.'
  },
  {
    category: 'Customers',
    q: 'What happens to my documents after printing?',
    a: 'Every file and session is automatically and permanently purged after 5 hours via our automated Cloud purge engine. You can also click "End Session & Delete Files Now" in your customer dashboard to instantly delete files.'
  },
  {
    category: 'Customers',
    q: 'Can other customers at the counter see my files?',
    a: 'Absolutely not. Each session is completely isolated. Only the verified shop operator with the matching counter code can view and print files requested with your specific 6-digit token.'
  },
  {
    category: 'Customers',
    q: 'Why is this better than WhatsApp, Bluetooth, or Email at a print shop?',
    a: 'Sending files via WhatsApp or email requires sharing your personal phone number or email address with the shop owner and often other customers standing nearby. Furthermore, files stay in the shopkeeper’s WhatsApp gallery or computer downloads indefinitely. SecurePrint requires no contact sharing and guarantees 5-hour automatic destruction.'
  },
  {
    category: 'Shop Owners',
    q: 'How does a print shop register for SecurePrint?',
    a: 'Click "Register Shop", fill in your counter details and address. Once our team approves your shop verification (usually within 1-2 hours), you can print your counter standee QR code and begin serving walk-in customers.'
  },
  {
    category: 'Shop Owners',
    q: 'Does it cost anything to set up?',
    a: 'SecurePrint is free for local retail printing shops and students. We believe in privacy-first digital infrastructure for everyone.'
  },
  {
    category: 'Shop Owners',
    q: 'What hardware or printers does SecurePrint support?',
    a: 'SecurePrint works with any standard printer (HP, Canon, Epson, Xerox, Konica Minolta, Ricoh, Brother). It runs in your desktop or tablet web browser and directly connects to your computer’s default print dialog.'
  }
];

export const FaqPage: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Customers', 'Shop Owners'];

  const filteredFaqs = FAQS.filter(f => selectedCategory === 'All' || f.category === selectedCategory);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10 text-left">
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Help Center</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Frequently Asked Questions
        </h1>
        <p className="text-sm text-slate-500">
          Everything you need to know about privacy, 5-hour ephemeral storage, and printing counter operations.
        </p>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setSelectedCategory(c)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              selectedCategory === c
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Accordion FAQ list */}
      <div className="space-y-3">
        {filteredFaqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden transition-all shadow-xs"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                    Q
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{faq.q}</h3>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-6 rounded-2xl bg-slate-900 text-white text-center space-y-3">
        <h4 className="text-base font-bold">Have more questions or need counter onboarding support?</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Our security engineering and merchant support team is available 7 days a week.
        </p>
        <Link
          to="/contact"
          className="inline-block px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
        >
          Contact Support Team →
        </Link>
      </div>
    </div>
  );
};
