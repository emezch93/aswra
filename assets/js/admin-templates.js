// Default email templates for the administrator's message composer.
// Wording for approval, rejection and additional information follows the approved brief.
const SIGN = "Kind regards,\n\nMembership Administrator\nAnambra State Waste Recyclers Association";
const REF = "[Application Reference]";
const NAME = "[Applicant Name]";
const REASON = "[Administrator's specific explanation]";
const INFO = "[Specific information requested by the administrator]";

export const TEMPLATES = {
  approval: {
    label: "Approval (congratulations)", detail: null,
    subject: "Congratulations! Your ASWRA Membership Application Has Been Approved",
    body: `Dear ${NAME},\n\nCongratulations!\n\nWe are pleased to inform you that your membership application to the Anambra State Waste Recyclers Association (ASWRA) has been successfully reviewed and approved.\n\nWe welcome you to the association and look forward to your participation in our collective efforts towards responsible waste management, recycling development and environmental sustainability in Anambra State.\n\nYour application reference is ${REF}.\n\nThank you for your interest in ASWRA.\n\n${SIGN}`,
  },
  rejection: {
    label: "Rejection (with explanation)",
    detail: { label: "Reason for the decision", help: "Explain the actual reason clearly and respectfully. Choose a reason category to start, then edit the wording.", required: true, reasons: true },
    subject: "Update on Your ASWRA Membership Application",
    body: `Dear ${NAME},\n\nThank you for your interest in joining the Anambra State Waste Recyclers Association.\n\nFollowing a review of your application, we regret to inform you that your application has not been approved at this time.\n\nReason: ${REASON}\n\nWe appreciate your interest in ASWRA and encourage you to review the stated reason. Where applicable, you may contact the association for clarification on the relevant requirements.\n\nYour application reference is ${REF}.\n\nThank you for your understanding.\n\n${SIGN}`,
    token: REASON,
  },
  additional_information: {
    label: "Additional information required",
    detail: { label: "Information needed", help: "Say what is missing, why it is needed and how to send it.", required: true },
    subject: "Additional Information Required \u2013 ASWRA Membership Application",
    body: `Dear ${NAME},\n\nThank you for submitting your membership application to ASWRA.\n\nDuring our review, we identified that some additional information is required before we can continue processing your application.\n\nThe information required is:\n\n${INFO}\n\nKindly provide the requested information by replying to this email and quoting your application reference: ${REF}.\n\nThank you for your cooperation.\n\n${SIGN}`,
    token: INFO,
  },
  under_review: {
    label: "Application is under review", detail: null,
    subject: "Your ASWRA Membership Application Is Under Review",
    body: `Dear ${NAME},\n\nThank you for applying to join the Anambra State Waste Recyclers Association.\n\nThis is to let you know that your application is now being reviewed. We will contact you when there is an update.\n\nYour application reference is ${REF}. You can also check progress at any time on the Application Status page of our website.\n\n${SIGN}`,
  },
  receipt_confirmation: {
    label: "Additional information received", detail: null,
    subject: "We Have Received Your Additional Information \u2013 ASWRA",
    body: `Dear ${NAME},\n\nThank you for sending the additional information for your membership application.\n\nWe confirm that we have received it and will continue with our review.\n\nYour application reference is ${REF}.\n\n${SIGN}`,
  },
  general_update: {
    label: "General application update",
    detail: { label: "Update message", help: "Write the update you want the applicant to receive.", required: true },
    subject: "Update on Your ASWRA Membership Application",
    body: `Dear ${NAME},\n\nWe are writing with an update on your membership application to ASWRA.\n\n${REASON}\n\nYour application reference is ${REF}.\n\n${SIGN}`,
    token: REASON,
  },
  clarification: {
    label: "Request for clarification",
    detail: { label: "What needs to be clarified", help: "Ask your question clearly.", required: true },
    subject: "Clarification Needed \u2013 ASWRA Membership Application",
    body: `Dear ${NAME},\n\nThank you for your application to ASWRA.\n\nWe would like to clarify the following point before we continue:\n\n${INFO}\n\nPlease reply to this email and quote your application reference: ${REF}.\n\nThank you.\n\n${SIGN}`,
    token: INFO,
  },
};

export const REJECTION_REASONS = [
  "Eligibility requirements not met",
  "Required information missing",
  "Submitted information could not be verified",
  "Organisational documentation insufficient",
  "Does not meet the membership category requirements",
  "Other reason specified by the administrator",
];

const REASON_STARTERS = {
  "Eligibility requirements not met": "Based on the information provided, the eligibility requirements for this membership category were not met. ",
  "Required information missing": "Required information was missing from your application. ",
  "Submitted information could not be verified": "We were unable to verify some of the information you submitted. ",
  "Organisational documentation insufficient": "The organisational documentation provided was not sufficient for our review. ",
  "Does not meet the membership category requirements": "The application does not meet the requirements of the membership category you selected. ",
  "Other reason specified by the administrator": "",
};
export const reasonStarter = (r) => REASON_STARTERS[r] || "";

export function buildMessage(type, { name, reference, detail }) {
  const t = TEMPLATES[type];
  let body = t.body.split(NAME).join(name).split(REF).join(reference);
  if (t.token && detail && detail.trim()) body = body.split(t.token).join(detail.trim());
  return { subject: t.subject, body };
}

export const PLACEHOLDER = /\[(Applicant Name|Application Reference|Administrator's specific explanation|Specific information requested by the administrator)\]/;

export function mailtoUrl(to, subject, body) {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, "\r\n"))}`;
}
