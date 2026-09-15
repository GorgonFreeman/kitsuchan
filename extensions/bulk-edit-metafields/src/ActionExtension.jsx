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
  dryRunRules,
  fetchAllProductMetafieldDefinitions,
  runBulkMetafieldRules,
  sampleMetafieldValues,
} from './operations.js';
import {
  definitionLabel,
  emptyEditorValue,
  isListType,
  summarizeRuleValue,
} from './valueCodec.js';

const BULK_TARGET = 'admin.product-index.selection-action.render';

function newRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyRule() {
  return {
    id: newRuleId(),
    definitionId: '',
    operation: '',
    editorValue: null,
    clearConfirm: '',
  };
}

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
  const [rules, setRules] = useState([createEmptyRule()]);
  const [step, setStep] = useState('edit'); // edit | review | running | result
  const [dryRun, setDryRun] = useState([]);
  const [runResults, setRunResults] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [samplesByRule, setSamplesByRule] = useState({});

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

  function updateRule(id, patch) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setStep('edit');
    setRunResults(null);
  }

  function removeRule(id) {
    setRules((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [createEmptyRule()];
    });
    setStep('edit');
  }

  function addRule() {
    setRules((prev) => [...prev, createEmptyRule()]);
    setStep('edit');
  }

  function resolveRule(rule) {
    const definition = definitions.find((d) => d.id === rule.definitionId);
    if (!definition || !rule.operation) return null;
    if (!isEditorReady(definition, rule.operation, rule.editorValue, rule.clearConfirm)) {
      return null;
    }
    return {
      definition,
      operation: rule.operation,
      editorValue: editorValueForOperation(definition, rule.operation, rule.editorValue),
    };
  }

  const resolvedRules = rules.map(resolveRule);
  const allReady = count > 0 && resolvedRules.every(Boolean);

  async function openMetafieldPicker(ruleId, currentId) {
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
          selected: def.id === currentId,
        })),
      });
      const selected = await picker.selected;
      if (!selected?.length) return;
      const definitionId = String(selected[0]);
      const definition = definitions.find((d) => d.id === definitionId);
      updateRule(ruleId, {
        definitionId,
        operation: '',
        editorValue: null,
        clearConfirm: '',
      });
      if (definition) {
        loadSample(ruleId, definition);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadSample(ruleId, definition) {
    try {
      const sample = await sampleMetafieldValues(productGids, definition, 5);
      setSamplesByRule((prev) => ({ ...prev, [ruleId]: sample }));
    } catch {
      setSamplesByRule((prev) => ({ ...prev, [ruleId]: null }));
    }
  }

  function selectOperation(rule, op) {
    const definition = definitions.find((d) => d.id === rule.definitionId);
    updateRule(rule.id, {
      operation: op,
      editorValue: definition ? emptyEditorValue(definition.type, op) : null,
      clearConfirm: '',
    });
  }

  async function goToReview() {
    if (!allReady) {
      setErrorMessage(i18n.translate('rules-incomplete'));
      return;
    }
    setErrorMessage('');
    setStep('review');
    setDryRun([]);
    try {
      const reports = await dryRunRules(productGids, resolvedRules);
      setDryRun(reports);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('edit');
    }
  }

  async function confirmApply() {
    if (!allReady) return;
    setStep('running');
    setErrorMessage('');
    try {
      const results = await runBulkMetafieldRules(productGids, resolvedRules);
      setRunResults(results);
      setStep('result');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('edit');
    }
  }

  const heading = i18n.translate(isBulk ? 'heading-bulk' : 'heading');
  const description = isBulk
    ? i18n.translate('description-bulk', { count })
    : i18n.translate('description');

  const primaryDisabled =
    step === 'running' ||
    (step === 'edit' && !allReady) ||
    (step === 'review' && dryRun.length === 0);

  function primaryClick() {
    if (step === 'edit') goToReview();
    else if (step === 'review') confirmApply();
    else if (step === 'result') close();
  }

  const primaryLabel =
    step === 'edit'
      ? i18n.translate('review')
      : step === 'review'
        ? i18n.translate('confirm-apply')
        : step === 'running'
          ? i18n.translate('editing')
          : i18n.translate('done');

  return (
    <s-admin-action heading={heading}>
      <s-button
        slot="primary-action"
        disabled={primaryDisabled}
        loading={step === 'running' || (step === 'review' && dryRun.length === 0 && !errorMessage)}
        onClick={primaryClick}
      >
        {primaryLabel}
      </s-button>
      <s-button
        slot="secondary-actions"
        onClick={() => {
          if (step === 'review') setStep('edit');
          else close();
        }}
      >
        {step === 'review' ? i18n.translate('back-edit') : i18n.translate('close')}
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

        {errorMessage && step === 'edit' && (
          <s-banner tone="critical">
            <s-text>{i18n.translate('error', { message: errorMessage })}</s-text>
          </s-banner>
        )}

        {step === 'edit' && !defsLoading && definitions.length > 0 && (
          <s-stack direction="block" gap="large">
            {rules.map((rule, index) => (
              <RuleEditor
                key={rule.id}
                index={index}
                rule={rule}
                definitions={definitions}
                sample={samplesByRule[rule.id]}
                i18n={i18n}
                canRemove={rules.length > 1}
                onPickMetafield={() => openMetafieldPicker(rule.id, rule.definitionId)}
                onSelectOperation={(op) => selectOperation(rule, op)}
                onChangeValue={(editorValue) => updateRule(rule.id, { editorValue })}
                onClearConfirm={(clearConfirm) => updateRule(rule.id, { clearConfirm })}
                onRemove={() => removeRule(rule.id)}
                onError={(message) => setErrorMessage(message)}
              />
            ))}
            <s-button onClick={addRule}>{i18n.translate('add-rule')}</s-button>
          </s-stack>
        )}

        {step === 'review' && (
          <s-stack direction="block" gap="base">
            <s-text type="strong">{i18n.translate('review-heading')}</s-text>
            {dryRun.length === 0 && !errorMessage && (
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-spinner />
                <s-text>{i18n.translate('building-review')}</s-text>
              </s-stack>
            )}
            {dryRun.map((report, index) => (
              <s-stack key={report.definition.id + report.operation + index} direction="block" gap="small-200">
                <s-text type="strong">
                  {i18n.translate('review-rule', {
                    op: i18n.translate(`op-${report.operation}`),
                    metafield: definitionLabel(report.definition),
                  })}
                </s-text>
                <s-text color="subdued">
                  {summarizeRuleValue(
                    report.definition.type,
                    report.operation,
                    resolvedRules[index]?.editorValue,
                  )}
                </s-text>
                <s-text>
                  {i18n.translate('review-stats', {
                    willChange: report.willChange,
                    unchanged: report.unchanged,
                    missing: report.missing,
                  })}
                </s-text>
                {report.examples.map((ex, i) => (
                  <s-text key={i} color="subdued">
                    {i18n.translate('review-example', {
                      title: ex.title,
                      from: ex.from,
                      to: ex.to,
                    })}
                  </s-text>
                ))}
                <s-divider />
              </s-stack>
            ))}
          </s-stack>
        )}

        {step === 'running' && (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-spinner />
            <s-text>{i18n.translate('editing')}</s-text>
          </s-stack>
        )}

        {step === 'result' && runResults && (
          <s-stack direction="block" gap="base">
            <s-banner tone={runResults.some((r) => r.failed > 0) ? 'warning' : 'success'}>
              <s-text type="strong">{i18n.translate('session-result')}</s-text>
              {runResults.map((result, index) => (
                <s-text key={index}>
                  {i18n.translate('success', {
                    index: index + 1,
                    success: result.success,
                    total: result.total,
                  })}
                </s-text>
              ))}
              {runResults.some((r) => r.failed > 0) && (
                <s-text>{i18n.translate('partial-note')}</s-text>
              )}
            </s-banner>
          </s-stack>
        )}
      </s-stack>
    </s-admin-action>
  );
}

function RuleEditor({
  index,
  rule,
  definitions,
  sample,
  i18n,
  canRemove,
  onPickMetafield,
  onSelectOperation,
  onChangeValue,
  onClearConfirm,
  onRemove,
  onError,
}) {
  const definition = definitions.find((d) => d.id === rule.definitionId) ?? null;
  const listType = definition ? isListType(definition.type) : false;
  const operations = listType
    ? ['add', 'update', 'remove', 'clear']
    : ['update', 'clear'];

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
          <s-text type="strong">{i18n.translate('rule', { index: index + 1 })}</s-text>
          {canRemove && (
            <s-button tone="critical" variant="tertiary" onClick={onRemove}>
              {i18n.translate('remove-rule')}
            </s-button>
          )}
        </s-stack>

        <s-stack direction="block" gap="small-200">
          <s-text type="strong">{i18n.translate('select-metafield')}</s-text>
          {definition ? (
            <s-stack direction="block" gap="small-200">
              <s-text>{definitionLabel(definition)}</s-text>
              <s-text color="subdued">{definition.type}</s-text>
              <s-button onClick={onPickMetafield}>{i18n.translate('change-metafield')}</s-button>
            </s-stack>
          ) : (
            <s-button onClick={onPickMetafield}>
              {i18n.translate('select-metafield-placeholder')}
            </s-button>
          )}
        </s-stack>

        {definition && sample && (
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">{i18n.translate('current-values')}</s-text>
            <s-text color="subdued">
              {i18n.translate('current-with-without', {
                withValue: sample.withValue,
                sampled: sample.sampled,
              })}
            </s-text>
            {sample.samples.map((s) => (
              <s-text key={s.productId} color="subdued">
                {s.title}: {s.display}
              </s-text>
            ))}
          </s-stack>
        )}

        {definition && (
          <s-stack direction="block" gap="base">
            <s-choice-list
              label={i18n.translate('operation')}
              name={`operation-${rule.id}`}
              values={rule.operation ? [rule.operation] : []}
              onChange={(e) => {
                const values = e?.currentTarget?.values ?? e;
                const next = Array.isArray(values) ? values[0] : values;
                if (next) onSelectOperation(String(next));
              }}
            >
              {operations.map((op) => (
                <s-choice key={op} value={op}>
                  {i18n.translate(`op-${op}`)}
                </s-choice>
              ))}
            </s-choice-list>

            {rule.operation && (
              <s-text color="subdued">{i18n.translate(`op-${rule.operation}-help`)}</s-text>
            )}

            {rule.operation === 'clear' && (
              <s-text-field
                label={i18n.translate('clear-confirm-label')}
                placeholder={i18n.translate('clear-confirm-placeholder')}
                value={rule.clearConfirm}
                onChange={(e) => onClearConfirm(e.currentTarget.value)}
              />
            )}

            {rule.operation && rule.operation !== 'clear' && (
              <ValueEditor
                definition={definition}
                operation={rule.operation}
                value={rule.editorValue}
                onChange={onChangeValue}
                onError={onError}
                i18n={i18n}
              />
            )}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}
