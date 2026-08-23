const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../src/pages/AdminPage.tsx');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('AdminCampaignReviewModal')) {
  s = s.replace(
    "import { DonationsAdminPanel } from '../components/admin/DonationsAdminPanel';",
    "import { DonationsAdminPanel } from '../components/admin/DonationsAdminPanel';\nimport { AdminCampaignReviewModal } from '../components/admin/AdminCampaignReviewModal';"
  );
}

if (!s.includes('reviewCampaign')) {
  s = s.replace(
    'const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);',
    "const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);\n  const [reviewCampaign, setReviewCampaign] = useState<AdminCampaign | null>(null);"
  );
}

const reviewDetailsBtn =
  '                        <button\n' +
  '                          type="button"\n' +
  '                          onClick={() => setReviewCampaign(c)}\n' +
  '                          className="px-4 py-2 rounded-lg border border-brand-200 bg-brand-50 text-brand-800 font-bold text-sm hover:bg-brand-100">\n' +
  '                          Review details\n' +
  '                        </button>\n';

if (!s.includes('Review details')) {
  const needle =
    '                        {c.verificationDocumentUrl || c.creator?.hasKycDocument ? (\n' +
    '                          <button\n' +
    '                            type="button"\n' +
    '                            onClick={() => void handleOpenVerificationDocument(c.id)}\n' +
    '                            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-800 font-bold text-sm hover:bg-slate-50 flex items-center gap-1.5">\n' +
    '                            <ExternalLinkIcon className="w-4 h-4" />\n' +
    '                            View ID document';
  if (!s.includes(needle)) {
    // try CRLF
    const needleCrlf = needle.replace(/\n/g, '\r\n');
    if (s.includes(needleCrlf)) {
      s = s.replace(needleCrlf, reviewDetailsBtn.replace(/\n/g, '\r\n') + needleCrlf);
    } else {
      console.error('queue needle not found');
      const idx = s.indexOf('View ID document');
      console.log(JSON.stringify(s.slice(idx - 280, idx + 40)));
      process.exit(1);
    }
  } else {
    s = s.replace(needle, reviewDetailsBtn + needle);
  }
}

const tableReview =
  '                          <button\n' +
  '                            type="button"\n' +
  '                            onClick={() => setReviewCampaign(c)}\n' +
  '                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-brand-200 text-brand-800 hover:bg-brand-50">\n' +
  '                            Review\n' +
  '                          </button>\n';

if (!s.includes('setReviewCampaign(c)}') || (s.match(/setReviewCampaign\(c\)/g) || []).length < 2) {
  const activeBlock =
    "                          {c.status === 'Active' && (\n" +
    '                            <Link\n' +
    '                              to={`/campaign/${c.slug}`}\n' +
    '                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-brand-600 hover:bg-brand-50">\n' +
    '                              View\n' +
    '                            </Link>\n' +
    '                          )}';
  const activeCrlf = activeBlock.replace(/\n/g, '\r\n');
  if (s.includes(activeBlock)) {
    s = s.replace(activeBlock, tableReview + activeBlock);
  } else if (s.includes(activeCrlf)) {
    s = s.replace(activeCrlf, tableReview.replace(/\n/g, '\r\n') + activeCrlf);
  } else {
    console.error('active view block not found');
    process.exit(1);
  }
}

if (!s.includes('<AdminCampaignReviewModal')) {
  const modalMount =
    '\n      {reviewCampaign ? (\n' +
    '        <AdminCampaignReviewModal\n' +
    '          campaign={reviewCampaign}\n' +
    '          busy={busyCampaignId === reviewCampaign.id}\n' +
    '          onClose={() => setReviewCampaign(null)}\n' +
    '          onViewId={\n' +
    '            reviewCampaign.verificationDocumentUrl || reviewCampaign.creator?.hasKycDocument\n' +
    '              ? () => void handleOpenVerificationDocument(reviewCampaign.id)\n' +
    '              : undefined\n' +
    '          }\n' +
    '          onApprove={\n' +
    "            reviewCampaign.status === 'PendingReview'\n" +
    '              ? () => {\n' +
    "                  void handleCampaignStatus(reviewCampaign.id, 'Active').then(() =>\n" +
    '                    setReviewCampaign(null)\n' +
    '                  );\n' +
    '                }\n' +
    '              : undefined\n' +
    '          }\n' +
    '          onReject={\n' +
    "            reviewCampaign.status === 'PendingReview'\n" +
    '              ? () => {\n' +
    "                  void handleCampaignStatus(reviewCampaign.id, 'Rejected').then(() =>\n" +
    '                    setReviewCampaign(null)\n' +
    '                  );\n' +
    '                }\n' +
    '              : undefined\n' +
    '          }\n' +
    '        />\n' +
    '      ) : null}\n';

  const marker = '{markPaidWithdrawal';
  const mi = s.indexOf(marker);
  if (mi === -1) {
    console.error('markPaid marker missing');
    process.exit(1);
  }
  // find start of line with marker
  const lineStart = s.lastIndexOf('\n', mi) + 1;
  const useCrlf = s.includes('\r\n');
  const mount = useCrlf ? modalMount.replace(/\n/g, '\r\n') : modalMount;
  s = s.slice(0, lineStart) + mount + s.slice(lineStart);
}

fs.writeFileSync(p, s);
console.log({
  import: s.includes('AdminCampaignReviewModal'),
  state: s.includes('reviewCampaign'),
  reviewDetails: s.includes('Review details'),
  reviewCount: (s.match(/setReviewCampaign\(c\)/g) || []).length,
  mount: s.includes('<AdminCampaignReviewModal')
});
