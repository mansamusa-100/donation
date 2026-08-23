const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'src/pages/AdminPage.tsx');
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

const reviewBtn = `                        <button
                          type="button"
                          onClick={() => setReviewCampaign(c)}
                          className="px-4 py-2 rounded-lg border border-brand-200 bg-brand-50 text-brand-800 font-bold text-sm hover:bg-brand-100">
                          Review details
                        </button>
`;

if (!s.includes('Review details')) {
  s = s.replace(
    `                      <div className="mt-auto pt-5 flex flex-wrap gap-2">
                        {c.verificationDocumentUrl || c.creator?.hasKycDocument ? (`,
    `                      <div className="mt-auto pt-5 flex flex-wrap gap-2">
${reviewBtn}                        {c.verificationDocumentUrl || c.creator?.hasKycDocument ? (`
  );
}

const tableReview = `                          <button
                            type="button"
                            onClick={() => setReviewCampaign(c)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-brand-200 text-brand-800 hover:bg-brand-50">
                            Review
                          </button>
`;

if (!s.includes('>Review</button>') && !s.includes("Review\n                          </button>")) {
  s = s.replace(
    `{c.status === 'Active' && (
                            <Link
                              to={\`/campaign/\${c.slug}\`}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-brand-600 hover:bg-brand-50">
                              View
                            </Link>
                          )}`,
    `${tableReview}                          {c.status === 'Active' && (
                            <Link
                              to={\`/campaign/\${c.slug}\`}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-brand-600 hover:bg-brand-50">
                              View
                            </Link>
                          )}`
  );
}

const modalMount = `
      {reviewCampaign ? (
        <AdminCampaignReviewModal
          campaign={reviewCampaign}
          busy={busyCampaignId === reviewCampaign.id}
          onClose={() => setReviewCampaign(null)}
          onViewId={
            reviewCampaign.verificationDocumentUrl || reviewCampaign.creator?.hasKycDocument
              ? () => void handleOpenVerificationDocument(reviewCampaign.id)
              : undefined
          }
          onApprove={
            reviewCampaign.status === 'PendingReview'
              ? () => {
                  void handleCampaignStatus(reviewCampaign.id, 'Active').then(() =>
                    setReviewCampaign(null)
                  );
                }
              : undefined
          }
          onReject={
            reviewCampaign.status === 'PendingReview'
              ? () => {
                  void handleCampaignStatus(reviewCampaign.id, 'Rejected').then(() =>
                    setReviewCampaign(null)
                  );
                }
              : undefined
          }
        />
      ) : null}
`;

if (!s.includes('<AdminCampaignReviewModal')) {
  // Mount near end of main return — before final closing of outermost fragment/div
  const marker = '      {markPaidWithdrawal && (';
  if (s.includes(marker)) {
    s = s.replace(marker, modalMount + '\n' + marker);
  } else {
    // fallback: before last return close of component — insert before final `  );\n}`
    const idx = s.lastIndexOf('\n  );\n}');
    if (idx === -1) {
      throw new Error('Could not find mount point for review modal');
    }
    s = s.slice(0, idx) + modalMount + s.slice(idx);
  }
}

fs.writeFileSync(p, s);
console.log('done', {
  import: s.includes('AdminCampaignReviewModal'),
  state: s.includes('reviewCampaign'),
  reviewDetails: s.includes('Review details'),
  mount: s.includes('<AdminCampaignReviewModal')
});
