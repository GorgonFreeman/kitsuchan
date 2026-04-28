import { AppProvider, Card, Page, Text } from '@shopify/polaris';
import polarisEn from '@shopify/polaris/locales/en.json';

export default function App() {
  return (
    <AppProvider i18n={ polarisEn }>
      <Page title="minishopi">
        <Card>
          <Text variant="bodyMd" as="p">
            It's minishopi c:
          </Text>
        </Card>
      </Page>
    </AppProvider>
  );
}
