/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import {
  editorValueForOperation,
  isEditorReady,
  ValueEditor,
} from './components/ValueEditor.jsx';
import {
  fetchAllProductMetafieldDefinitions,
  runBulkMetafieldOperation,
} from './operations.js';
import {
  definitionLabel,
  isListType,
  isSupportedType,
} from './valueCodec.js';

const BULK_TARGET = 'admin.product-index.selection-action.render';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { close, data, i18n, extension } = shopify;
  const isBulk = String(extension.target) === BULK_TARGET;

  const productGids = (data.selected ?? [])
    .map((item) => item?.id)
    .filter(Boolean);
  const count = productGids.length;

  const [definitions, setDefinitions] = useState([]);
  const [defsLoading, setDefsLoading] = useState(true);
  const [defsError, setDefsError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [operation, setOperation] = useState('');
  const [editorValue, setEditorValue] = useState(null);
  const [clearConfirm, setClearConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [resultSummary, setResultSummary] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const defs = await fetchAllProductMetafieldDefinitions();
        if (!cancelled) {
          setDefinitions(defs);
          setDefsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setDefsError(err instanceof Error ? err.message : String(err));
          setDefsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const definition = definitions.find((d) => d.id === selectedId) ?? null;
  const supported = definition ? isSupportedType(definition.type) : false;
  const listType = definition ? isListType(definition.type) : false;

  function selectMetafield(id) {
    setSelectedId(id);
    setOperation('');
    setEditorValue(null);
    setClearConfirm('');
    setStatus('idle');
    setResultSummary(null);
    setErrorMessage('');
  }

  async function openMetafieldPicker() {
    try {
      const picker = await shopify.picker({
        heading: i18n.translate('select-metafield'),
        multiple: false,
        headers: [
          { content: 'Namespace.key' },
          { content: 'Type' },
        ],
        items: definitions.map((def) => ({
          id: def.id,
          heading: def.name,
          data: [`${def.namespace}.${def.key}`, def.type],
          selected: def.id === selectedId,
        })),
      });
      const selected = await picker.selected;
      if (!selected?.length) return;
      selectMetafield(String(selected[0]));
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function selectOperation(op) {
    setOperation(op);
    setEditorValue(listType || op === 'add' || op === 'remove' ? [] : '');
    setClearConfirm('');
    setStatus('idle');
    setResultSummary(null);
    setErrorMessage('');
  }

  const canApply =
    count > 0 &&
    definition &&
    supported &&
    operation &&
    status !== 'running' &&
    isEditorReady(definition, operation, editorValue, clearConfirm);

  async function apply() {
    if (!canApply) return;
    setStatus('running');
    setErrorMessage('');
    setResultSummary(null);
    try {
      const prepared = editorValueForOperation(definition, operation, editorValue);
      const result = await runBulkMetafieldOperation(
        /** @type {'add'|'update'|'remove'|'clear'} */ (operation),
        {
          productGids,
          definition,
          editorValue: prepared,
        },
      );
      setResultSummary(result);
      if (result.failed > 0 || result.errors?.length) {
        setStatus('partial');
        setErrorMessage(result.errors?.[0] ?? 'Some updates failed');
      } else {
        setStatus('success');
      }
      // Keep metafield + operation; reset values for another apply
      setEditorValue(listType || operation === 'add' || operation === 'remove' ? [] : '');
      setClearConfirm('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const operations = listType
    ? ['add', 'update', 'remove', 'clear']
    : ['update', 'clear'];

  const heading = i18n.translate(isBulk ? 'heading-bulk' : 'heading');
  const description = isBulk
    ? i18n.translate('description-bulk', { count })
    : i18n.translate('description');

  return (
    <s-admin-action heading={heading}>
      <s-button
        slot="primary-action"
        disabled={!canApply}
        loading={status === 'running'}
        onClick={apply}
      >
        {operation === 'clear'
          ? i18n.translate('clear-action')
          : i18n.translate('apply')}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => close()}>
        {status === 'success' || status === 'partial'
          ? i18n.translate('done')
          : i18n.translate('close')}
      </s-button>

      <s-stack direction="block" gap="base">
        <s-text>{description}</s-text>

        {count === 0 && (
          <s-banner tone="warning">
            <s-text>{i18n.translate('no-products')}</s-text>
          </s-banner>
        )}

        {defsLoading && (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-spinner />
            <s-text>{i18n.translate('loading-definitions')}</s-text>
          </s-stack>
        )}

        {defsError && (
          <s-banner tone="critical">
            <s-text>{defsError}</s-text>
          </s-banner>
        )}

        {!defsLoading && !defsError && definitions.length === 0 && (
          <s-banner tone="warning">
            <s-text>{i18n.translate('no-definitions')}</s-text>
          </s-banner>
        )}

        {!defsLoading && definitions.length > 0 && (
          <s-stack direction="block" gap="base">
            <s-text type="strong">{i18n.translate('select-metafield')}</s-text>
            {definition ? (
              <s-stack direction="block" gap="small-200">
                <s-text>{definitionLabel(definition)}</s-text>
                <s-text color="subdued">{definition.type}</s-text>
                <s-button onClick={openMetafieldPicker}>
                  {i18n.translate('change-metafield')}
                </s-button>
              </s-stack>
            ) : (
              <s-button onClick={openMetafieldPicker}>
                {i18n.translate('select-metafield-placeholder')}
              </s-button>
            )}
          </s-stack>
        )}

        {definition && !supported && (
          <s-banner tone="warning">
            <s-text>{i18n.translate('type-unsupported')}</s-text>
          </s-banner>
        )}

        {definition && supported && (
          <s-stack direction="block" gap="base">
            <s-choice-list
              label={i18n.translate('operation')}
              name="operation"
              values={operation ? [operation] : []}
              onChange={(e) => {
                const values = e?.currentTarget?.values ?? e;
                const next = Array.isArray(values) ? values[0] : values;
                if (next) selectOperation(String(next));
              }}
            >
              {operations.map((op) => (
                <s-choice key={op} value={op}>
                  {i18n.translate(`op-${op}`)}
                </s-choice>
              ))}
            </s-choice-list>

            {operation && (
              <s-text color="subdued">{i18n.translate(`op-${operation}-help`)}</s-text>
            )}

            {operation === 'clear' && (
              <s-text-field
                label={i18n.translate('clear-confirm-label')}
                placeholder={i18n.translate('clear-confirm-placeholder')}
                value={clearConfirm}
                onChange={(e) => setClearConfirm(e.currentTarget.value)}
              />
            )}

            {operation && operation !== 'clear' && (
              <ValueEditor
                definition={definition}
                operation={operation}
                value={editorValue}
                onChange={setEditorValue}
                onError={(message) => {
                  setStatus('error');
                  setErrorMessage(message);
                }}
                i18n={i18n}
              />
            )}
          </s-stack>
        )}

        {status === 'running' && (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-spinner />
            <s-text>{i18n.translate('editing')}</s-text>
          </s-stack>
        )}

        {(status === 'success' || status === 'partial') && resultSummary && (
          <s-banner tone={status === 'success' ? 'success' : 'warning'}>
            <s-text>
              {i18n.translate('success', {
                success: resultSummary.success,
                total: resultSummary.total,
              })}
            </s-text>
            {status === 'partial' && (
              <s-text>{i18n.translate('partial-note')}</s-text>
            )}
          </s-banner>
        )}

        {status === 'error' && (
          <s-banner tone="critical">
            <s-text>{i18n.translate('error', { message: errorMessage })}</s-text>
            <s-text>{i18n.translate('partial-note')}</s-text>
          </s-banner>
        )}
      </s-stack>
    </s-admin-action>
  );
}
