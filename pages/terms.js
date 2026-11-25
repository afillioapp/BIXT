import LegalPage from "../components/LegalPage";

// Plain-language terms of use (2026-11-25), including the plan BX sells: a
// 14-day free trial, then $2.99 CAD a month (lib/billing.js).
export default function Terms() {
  return (
    <LegalPage title="Terms of Use" updated="November 25, 2026">
      <section>
        <h2>What BX does</h2>
        <p>
          BX reads your receipt photos and saves them, with the details it reads, to your own Google Drive, where your
          accountant can see them if you choose.
        </p>
      </section>

      <section>
        <h2>Check what BX reads</h2>
        <p>
          BX reads receipts automatically and can make mistakes. Please check the details before you rely on them. BX isn't
          tax or accounting advice, and figures like the HST totals are estimates from your saved receipts. Your accountant
          is the one to file your returns.
        </p>
      </section>

      <section>
        <h2>Your plan</h2>
        <ul>
          <li>New accounts get a 14-day free trial. No card is needed to start.</li>
          <li>After that, BX costs $2.99 CAD a month, plus any sales tax that applies, charged by Stripe each month.</li>
          <li>
            You can cancel at any time in Settings. BX keeps working until the end of the month you've paid for. We don't
            refund part months.
          </li>
          <li>If we ever change the price, we'll tell you at least 30 days before it applies to you.</li>
          <li>
            If you don't pay, you can't add new receipts, but everything already saved stays in your Google Drive and
            remains yours.
          </li>
        </ul>
      </section>

      <section>
        <h2>Using BX fairly</h2>
        <p>
          Use BX for your own business records. Don't try to break it, overload it, or use someone else's account. We may
          suspend an account that does.
        </p>
      </section>

      <section>
        <h2>The fine print</h2>
        <p>
          We work hard to keep BX running, but we can't promise it will always be available or free of errors. To the
          extent the law allows, our responsibility to you is limited to what you paid us in the last 12 months. These terms
          are governed by the laws of Ontario, Canada. We may update them, and we'll let you know when we do.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions: <a href="mailto:alireza.mthr@gmail.com?subject=BX%20terms">alireza.mthr@gmail.com</a>
        </p>
      </section>
    </LegalPage>
  );
}
