import { LitElement, html, nothing } from 'lit';

const pageModules = import.meta.glob('../pages/**/*.js', { eager: true });

const slugs = Object.keys(pageModules)
  .map((path) => path.match(/\/pages\/(.+)\.js$/u)?.[ 1 ])
  .filter(Boolean)
  .sort();

function slugToTag(slug) {
  return `kit-${ slug.replace(/[_/]/gu, '-') }`;
}

function humanizeSlug(slug) {
  return slug
    .split('/')
    .map((part) => part.replace(/-/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase()))
    .join(' › ');
}

class KitApp extends LitElement {
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    if (window.location.pathname === '/') {
      window.history.replaceState(null, '', `/pages/home${ window.location.search }`);
    }
  }

  render() {
    const search = window.location.search;
    const match = window.location.pathname.match(/^\/pages\/(.+)$/u);
    const slug = match && slugs.includes(match[1]) ? match[1] : 'home';
    const pageEl = document.createElement(slugToTag(slug));

    return html`
      <ui-nav-menu>
        ${ slugs.map(
          (s) => html`<a href=${ `/pages/${ s }${ search }` } rel=${ s === 'home' ? 'home' : nothing }>${ humanizeSlug(s) }</a>`,
        ) }
      </ui-nav-menu>
      ${ pageEl }
    `;
  }
}

customElements.define('kit-app', KitApp);
