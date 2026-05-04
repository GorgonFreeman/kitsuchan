import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function HomePage() {
  const [ searchParams ] = useSearchParams();
  const shop = searchParams.get('shop');
  const [ apiPayload, setApiPayload ] = useState(null);

  useEffect(() => {
    if (!shop) return;
    const q = new URLSearchParams({ shop });
    fetch(`/api/getCustomer?${ q.toString() }`)
      .then((r) => r.json())
      .then(setApiPayload)
      .catch(() => setApiPayload({ error: 'fetch failed' }));
  }, [ shop ]);

  return (
    <s-page heading="Home">
      <s-section>
        <s-paragraph>It&apos;s kitsuchan boi c:</s-paragraph>
        <pre
          style={ {
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.8125rem',
            opacity: 0.7,
          } }
        >
          { apiPayload ? JSON.stringify(apiPayload, null, 2) : '…' }
        </pre>
      </s-section>
    </s-page>
  );
}
