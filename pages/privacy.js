import LegalPage from "../components/LegalPage";

// Plain-language privacy policy (2026-11-25). Describes what the app actually
// does; keep it in step with the code when data handling changes.
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 25, 2026">
      <section>
        <h2>The short version</h2>
        <p>
          Your receipts and photos are saved in your own Google Drive, not on BX's servers. We only use your information to
          run BX for you, and we never sell it.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your name and email or phone number, so you can sign in.</li>
          <li>
            Permission to your Google Drive, limited to the files BX creates. BX can't see the rest of your Drive.
          </li>
          <li>
            Your receipt photos, which are sent to our reading service to pick out the vendor, total, tax and date. BX doesn't
            keep a copy on its servers.
          </li>
          <li>
            Your business settings (company name, fiscal year, accountant's email, categories, and your cards' names with
            only their last 4 digits). These are stored on your BX folder in your own Google Drive.
          </li>
          <li>
            Payment details, handled by Stripe. BX never sees or stores your full card number.
          </li>
        </ul>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <ul>
          <li>Your accountant, only if you add their email. They can see your receipts, not change them.</li>
          <li>
            The services that run BX: Google (sign-in and Drive), Anthropic (reading receipts), Stripe (payments) and Vercel
            (hosting the app). They only get what they need to do that job.
          </li>
        </ul>
        <p>We don't sell your information or use it for advertising.</p>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Your files are yours. They stay in your Google Drive even if you stop using BX.</li>
          <li>
            You can remove BX's access at any time from your Google account's security settings, and cancel your plan in
            BX under Settings.
          </li>
          <li>To have your BX account deleted, email us and we'll do it.</li>
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about your privacy: <a href="mailto:alireza.mthr@gmail.com?subject=BX%20privacy">alireza.mthr@gmail.com</a>
        </p>
      </section>
    </LegalPage>
  );
}
