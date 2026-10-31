import React, { useState } from 'react';
import { ShieldCheck, Mail, Phone, MapPin, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10 text-left">
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Data Protection</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Privacy & Ephemeral Storage Policy
        </h1>
        <p className="text-sm text-slate-500">Last updated: September 2026</p>
      </div>

      <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 text-slate-700">
        <section className="space-y-2 p-5 rounded-2xl bg-emerald-50 border border-emerald-200">
          <h2 className="text-base font-bold text-emerald-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>Zero Long-Term Customer Storage Guarantee</span>
          </h2>
          <p className="text-emerald-800">
            SecurePrint does not store, archive, index, or retain customer documents past their operational utility. All documents are assigned an immutable 5-hour expiration timestamp upon upload.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">1. Information We Collect from Customers</h3>
          <p>
            When initiating a print session via QR code, we collect only temporary runtime data:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Display Nickname (to identify your order at the counter)</li>
            <li>Optional Phone Number (only if specifically required by the print shop)</li>
            <li>Document binaries uploaded for printing</li>
            <li>Print preferences (Color, copies, page range)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">2. Information We Collect from Print Shops</h3>
          <p>
            Registered print businesses provide standard commercial contact details including business name, proprietor name, email address, phone number, physical address, and optional GSTIN for operational verification.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">3. Storage, Encryption & Destruction</h3>
          <p>
            All document transfers use Transport Layer Security (TLS 1.3) and are stored in encrypted cloud buckets. Files are authoritatively deleted using server-side cleanup routines 5 hours after session creation, or immediately upon customer manual deletion.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">4. Third-Party Sharing</h3>
          <p>
            SecurePrint never sells, licenses, or monetizes customer data. Documents are accessible strictly by the specific print shop whose counter QR code was scanned.
          </p>
        </section>
      </div>
    </div>
  );
};

export const TermsPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10 text-left">
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Legal Agreement</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500">Effective Date: September 2026</p>
      </div>

      <div className="text-sm leading-relaxed space-y-6 text-slate-700">
        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">1. Acceptance of Terms</h3>
          <p>
            By accessing or using the SecurePrint platform either as a customer or as a registered print shop, you agree to be bound by these Terms of Service.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">2. Prohibited Content</h3>
          <p>
            Users agree not to upload or transmit materials that violate applicable local laws, contain malware, promote illegal activities, or infringe upon third-party intellectual property.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">3. Ephemeral Nature of Service</h3>
          <p>
            Users acknowledge that SecurePrint is not a cloud storage or archival service. Documents are automatically and irrecoverably destroyed after 5 hours.
          </p>
        </section>
      </div>
    </div>
  );
};

export const ContactPage: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12 text-left">
      <div className="space-y-3 text-center max-w-xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Get In Touch</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Contact Support & Inquiries
        </h1>
        <p className="text-sm text-slate-600">
          Have questions about deploying SecurePrint at your photocopy shop or need technical assistance?
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Support Channels</h3>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-emerald-600" />
                <span>support@secureprint.internal</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>+91 (079) 2345-6789</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Gandhinagar, Gujarat, India</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-7">
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-sm">
            {submitted ? (
              <div className="text-center py-8 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h3 className="text-lg font-bold text-slate-900">Message Received</h3>
                <p className="text-sm text-slate-600">
                  Thank you for reaching out. Our support team will respond within 24 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Your Name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Ramesh Patel"
                />
                <Input
                  label="Email Address"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@company.com"
                />
                <Input
                  label="Subject"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Shop onboarding or support question"
                />
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Message
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 focus:outline-none"
                    placeholder="How can we assist you?"
                  />
                </div>
                <Button type="submit" size="md" variant="primary" className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  <span>Send Message</span>
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CookiePolicyPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10 text-left">
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Privacy & Storage</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Cookie & Local Storage Policy
        </h1>
        <p className="text-sm text-slate-500">Last updated: September 2026</p>
      </div>

      <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 text-slate-700">
        <section className="space-y-2 p-5 rounded-2xl bg-emerald-50 border border-emerald-200">
          <h2 className="text-base font-bold text-emerald-900">
            Zero Tracking & Zero Advertising Cookies
          </h2>
          <p className="text-emerald-800">
            SecurePrint does NOT use tracking pixels, ad cookies, or third-party behavioral analytics. We only use strictly necessary session identifiers.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">1. Essential Session Storage</h3>
          <p>
            When you scan a shop’s QR code, your browser holds a temporary session token in local memory. This token allows the shop counter to identify your uploaded files without requiring you to create an account. This token automatically expires after 5 hours.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">2. Authentication Cookies</h3>
          <p>
            For registered print shop owners and system administrators, Firebase Authentication sets secure, encrypted, HTTP-only tokens to keep your counter dashboard safely authenticated.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-slate-900">3. Managing Preferences</h3>
          <p>
            Because SecurePrint does not deploy tracking or marketing cookies, there is no need for invasive cookie consent popups. You may clear your browser’s cache or cookies at any time to immediately revoke your temporary desk session.
          </p>
        </section>
      </div>
    </div>
  );
};

