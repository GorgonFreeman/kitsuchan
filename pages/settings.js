import { LitElement, html } from 'lit';

class SettingsPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <s-page heading='Settings'>
        <s-section>
          <s-paragraph>
            Settings placeholder — file maps to route /pages/settings via autodiscovery.
          </s-paragraph>
        </s-section>
      </s-page>
    `;
  }
}

customElements.define('kit-settings', SettingsPage);
