import { LitElement, html } from 'lit';

class HomePage extends LitElement {
  static properties = {
    payload: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const shop = new URLSearchParams(window.location.search).get('shop');
    if (!shop) return;
    fetch(`/api/getCustomer?${ new URLSearchParams({ shop }).toString() }`)
      .then((r) => r.json())
      .then((p) => {
        this.payload = p;
      })
      .catch(() => {
        this.payload = { error: 'fetch failed' };
      });
  }

  render() {
    return html`
      <s-page heading='Home'>
        <s-section>
          <s-paragraph>It's kitsuchan boi c:</s-paragraph>
          <pre style='margin:0;white-space:pre-wrap;word-break:break-word;font-size:0.8125rem;opacity:0.7'>${ this.payload ? JSON.stringify(this.payload, null, 2) : '…' }</pre>
        </s-section>
      </s-page>
    `;
  }
}

customElements.define('kit-home', HomePage);
