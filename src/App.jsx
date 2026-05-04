import { NavMenu } from '@shopify/app-bridge-react';
import { AppProvider, Box, Text } from '@shopify/polaris';
import polarisEn from '@shopify/polaris/locales/en.json';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router-dom';

const pageModules = import.meta.glob('../pages/**/*.jsx', { eager: true });

function slugEntries() {
  return Object.keys(pageModules)
    .map((path) => {
      const m = path.match(/\/pages\/(.+)\.jsx$/);
      if (!m) return null;
      return { slug: m[1], Component: pageModules[path].default };
    })
    .filter(Boolean)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function humanizeSlug(slug) {
  return slug
    .split('/')
    .map((part) => part.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(' › ');
}

function HomeRedirect() {
  const { search } = useLocation();
  return <Navigate to={ { pathname: '/pages/home', search } } replace />;
}

function Shell() {
  const entries = slugEntries();
  const [ searchParams ] = useSearchParams();
  const qs = searchParams.toString();
  const q = qs ? `?${ qs }` : '';

  return (
    <>
      <NavMenu>
        { entries.map(({ slug }) => (
          <a
            key={ slug }
            href={ `/pages/${ slug }${ q }` }
            rel={ slug === 'home' ? 'home' : undefined }
          >
            { humanizeSlug(slug) }
          </a>
        )) }
      </NavMenu>
      <Box paddingBlockEnd="400">
        <Text variant="headingMd" as="span">
          kitsuchan
        </Text>
      </Box>
      <Outlet />
    </>
  );
}

export default function App() {
  const entries = slugEntries();

  return (
    <AppProvider i18n={ polarisEn }>
      <Routes>
        <Route path="/" element={ <HomeRedirect /> } />
        <Route element={ <Shell /> }>
          { entries.map(({ slug, Component }) => (
            <Route key={ slug } path={ `/pages/${ slug }` } element={ <Component /> } />
          )) }
          <Route path="*" element={ <HomeRedirect /> } />
        </Route>
      </Routes>
    </AppProvider>
  );
}
