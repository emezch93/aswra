# Administrator Guide

For the ASWRA membership administrator. No technical knowledge is needed.

## 1. Signing in and out

1. Open the website address followed by `/admin/` (for example `https://your-site.pages.dev/admin/`).
2. Enter your email and password and press **Sign in**.
3. When you finish, press **Log out** at the top right. Always log out on shared devices.

Your session ends by itself after a while without activity. If it does, just sign in again.

Never share your password. ASWRA staff will never ask you for it.

## 2. The applications screen

At the top are counts: Total, Pending, Under Review, Requires Information, Approved, Rejected. Tap a count to filter the list.

- **Search** by name, reference, email, phone or LGA.
- **Filters** by status and membership category. **Sort** by date, name, status or reference.
- **Clear filters** shows everything again.
- Press **View** on any row to open the application.

## 3. Reviewing an application

Open the application. On the left you see everything the applicant submitted. On the right are the actions.

Three kinds of text are kept separate and colour labelled:

| Label | Who sees it |
|---|---|
| **Private** (purple) | Only you. Internal notes. |
| **Shown to applicant** (green) | The applicant, on the public status page when they enter their reference. |
| **Email** (blue) | The email message you send to the applicant. |

### Step by step

1. **Start the review.** Under *Update status* choose **Under Review** and press *Update status*.
2. **Add private notes.** Under *Review note and recommendation* write your note and press *Save note*.
3. **Ask for more information (if needed).** Choose **Requires Information** and write a message for the applicant status page that says what is needed. Then prepare an email (section 5).
4. **Record a recommendation (optional).** In *Review note and recommendation* choose *Recommend approval* or *Recommend rejection* and write your note. A recommendation is **not** a decision. The applicant sees "Recommended for ..." and a reminder that the official decision is still to come.
5. **Record the official decision.** Under *Official decision* choose Approve or Reject and press *Record official decision*. A warning asks you to confirm. **The decision is final and cannot be changed.** You can only decide after the application is Under Review or Recommended.

### Approving

Approve, add an internal explanation if you wish, and optionally a short message for the status page. Then send the approval email (section 5). Do not promise cards, money, grants or contracts in your message unless ASWRA has confirmed them.

### Rejecting

You must choose a **reason category** and write an **explanation** of at least 10 characters. Choose the category that fits, then write the real reason in your own words. Be clear and respectful. Consider publishing a short explanation for the applicant on the status page, and always send a rejection email with the specific reason.

## 4. What the statuses mean

| Status | Meaning for the applicant |
|---|---|
| Pending | Received and waiting for review. |
| Under Review | Being examined by ASWRA. |
| Requires Information | ASWRA needs more information. |
| Recommended for Approval | A positive recommendation. Not yet official. |
| Recommended for Rejection | A negative recommendation. Not yet official. |
| Approved | Officially approved. |
| Rejected | Not approved. |

## 5. Sending email to the applicant

This system **never sends email itself**. You send it from your own email app.

1. Scroll to **Email to the applicant**.
2. Choose a **message type** (acknowledge application received, approval, rejection, additional information, under review, information received, general update, clarification). A template appears with the applicant's name and reference already filled in.
3. Where the template needs your words (for example the reason or the information needed), type them in the box and press **Put this into the message**. For rejections, you can first pick a reason category to start from.
4. **Edit** the subject and message as you wish. Press **Preview** to see it.
5. Press **Save and open email**. The message is saved as **Prepared** and your email app opens with the recipient, subject and message filled in. Check it and press Send in your email app.
   - Your phone or computer must have an email app set up (for example Gmail or Mail).
   - If it does not open, use **Copy message** in the list below, then paste it into a new email to the applicant.
6. After you have really sent it, press **Mark as sent** on that record. This is only **your own record**. It does not prove the email was delivered.

The system will not save a message that still has a template placeholder in [square brackets]. Fill it in first.

## 6. Records and history

- **Communication records** list every prepared message, its date and whether you marked it sent.
- **History** shows each status change, review note and decision, newest first. Nothing in the history can be edited or deleted.

## 7. If something goes wrong

- *"Your session has ended"*: sign in again.
- *"Too many attempts"*: wait about 15 minutes.
- Wrong password: check the email address and try again. After several failures you must wait.
- Forgotten password: contact the person who maintains the system (see the handover guide).
- A decision recorded by mistake cannot be undone in the dashboard. Contact the system maintainer, who can record a correction note.

## 8. System check (spam protection)

On the applications screen, open **System check: spam protection (Turnstile)**. It shows whether the settings are present (never the keys themselves), lists problems to fix, and counts verification failures in the last 24 hours. The button **Ask Cloudflare to check the secret key** confirms the private key is accepted. If applicants report "Verification failed", send a screenshot of this section to the system maintainer. It is also described in `TURNSTILE_TROUBLESHOOTING.md`.
