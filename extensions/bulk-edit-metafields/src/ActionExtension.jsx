/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  deleteMetafieldsOnProducts,
  fetchProductMetafieldDefinitions,
  setMetafieldsOnProducts,
} from './adminGraphql.js';
import {
  addListItem,
  defKey,
  isListType,
  isSetValueReady,
  isSupportedType,
  normalizeScalar,
  scalarTypeOf,
  serializeSetValue,
} from './metafieldTypes.js';

// Future list ops (read-merge-write): 'add' | 'remove'
/** @typedef {'set' | 'delete'} Action */

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { close, data, i18n } = shopify;
  const productGids = (data.selected ?? []).map((item) => item?.id).filter(Boolean);
  const count = productGids.length;

  const [ definitions, setDefinitions ] = useState([]);
  const [ defsStatus, setDefsStatus ] = useState('loading'); // loading | ready | error
  const [ defsError, setDefsError ] = useState('');

  const [ selectedKey, setSelectedKey ] = useState('');
  const [ action, setAction ] = useState(/** @type {Action} */ ('set'));
  const [ scalarValue, setScalarValue ] = useState('');
  const [ listItems, setListItems ] = useState([]);
  const [ listDraft, setListDraft ] = useState('');
  const [ deleteConfirm, setDeleteConfirm ] = useState('');

  const [ status, setStatus ] = useState('idle'); // idle | submitting | success | error
  const [ errorMessage, setErrorMessage ] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchProductMetafieldDefinitions()
      .then((nodes) => {
        if (cancelled) return;
        const supported = nodes
          .filter((n) => isSupportedType(n?.type?.name))
          .map((n) => ({
            name: n.name,
            namespace: n.namespace,
            key: n.key,
            type: n.type.name,
          }))
          .sort((a, b) => defKey(a).localeCompare(defKey(b)));
        setDefinitions(supported);
        if (supported.length) setSelectedKey(defKey(supported[ 0 ]));
        setDefsStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.log('bulkEditMetafieldsDefsError', err);
        setDefsError(err instanceof Error ? err.message : String(err));
        setDefsStatus('error');
      });
    return () => { cancelled = true; };
  }, []);

  const selected = definitions.find((d) => defKey(d) === selectedKey) ?? null;
  const listMode = selected ? isListType(selected.type) : false;

  function onSelectDefinition(nextKey) {
    setSelectedKey(nextKey);
    const next = definitions.find((d) => defKey(d) === nextKey);
    const scalar = next ? scalarTypeOf(next.type) : '';
    setScalarValue(scalar === 'boolean' ? 'true' : '');
    setListItems([]);
    setListDraft(scalar === 'boolean' ? 'true' : '');
    setDeleteConfirm('');
    setErrorMessage('');
    if (status === 'error' || status === 'success') setStatus('idle');
  }

  function onPickAction(next) {
    setAction(next);
    setDeleteConfirm('');
    setErrorMessage('');
    if (status === 'error' || status === 'success') setStatus('idle');
  }

  function tryAddListItem() {
    if (!selected) return;
    setListItems((prev) => addListItem(prev, selected.type, listDraft));
    setListDraft(scalarTypeOf(selected.type) === 'boolean' ? 'true' : '');
  }

  function removeListItem(item) {
    setListItems((prev) => prev.filter((x) => x !== item));
  }

  const setValue = listMode ? listItems : scalarValue;
  const canSubmit = (() => {
    if (!count || !selected || status === 'submitting') return false;
    if (action === 'delete') return deleteConfirm.trim() === 'delete';
    if (action === 'set') return isSetValueReady(selected.type, setValue);
    return false;
  })();

  async function runSubmit() {
    if (!canSubmit || !selected) return;
    setStatus('submitting');
    setErrorMessage('');
    try {
      if (action === 'delete') {
        await deleteMetafieldsOnProducts({
          productGids,
          namespace: selected.namespace,
          key: selected.key,
        });
      } else {
        const value = serializeSetValue(
          selected.type,
          listMode ? listItems : normalizeScalar(selected.type, scalarValue),
        );
        await setMetafieldsOnProducts({
          productGids,
          namespace: selected.namespace,
          key: selected.key,
          type: selected.type,
          value,
        });
      }
      setStatus('success');
    } catch (err) {
      console.log('bulkEditMetafieldsError', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  const isSubmitting = status === 'submitting';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const formLocked = isSubmitting || isSuccess;

  return (
    <s-admin-action heading={ i18n.translate('heading') }>
      { isSuccess ? (
        <s-button slot="primary-action" onClick={ () => { close(); } }>
          { i18n.translate('done') }
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          disabled={ !canSubmit }
          loading={ isSubmitting }
          onClick={ runSubmit }
        >
          { i18n.translate('submit') }
        </s-button>
      ) }
      <s-button slot="secondary-actions" onClick={ () => { close(); } }>
        { i18n.translate('close') }
      </s-button>

      <s-stack direction="block" gap="base">
        <s-text>{ i18n.translate('description', { count }) }</s-text>

        { count === 0 && (
          <s-banner tone="warning">
            <s-text>{ i18n.translate('no-products') }</s-text>
          </s-banner>
        ) }

        { defsStatus === 'loading' && (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-spinner />
            <s-text>{ i18n.translate('loading-definitions') }</s-text>
          </s-stack>
        ) }

        { defsStatus === 'error' && (
          <s-banner tone="critical">
            <s-text>{ i18n.translate('definitions-error') } { defsError }</s-text>
          </s-banner>
        ) }

        { defsStatus === 'ready' && definitions.length === 0 && (
          <s-banner tone="warning">
            <s-text>{ i18n.translate('no-definitions') }</s-text>
          </s-banner>
        ) }

        { defsStatus === 'ready' && definitions.length > 0 && !isSuccess && (
          <s-stack direction="block" gap="base">
            <s-select
              label={ i18n.translate('metafield-label') }
              value={ selectedKey }
              disabled={ formLocked }
              onChange={ (e) => onSelectDefinition(e.currentTarget.value) }
            >
              { definitions.map((d) => (
                <s-option key={ defKey(d) } value={ defKey(d) }>
                  { `${ d.name } (${ defKey(d) })` }
                </s-option>
              )) }
            </s-select>

            <s-stack direction="inline" gap="small">
              <s-button
                variant={ action === 'set' ? 'primary' : 'secondary' }
                disabled={ formLocked }
                onClick={ () => onPickAction('set') }
              >
                { i18n.translate('action-set') }
              </s-button>
              <s-button
                variant={ action === 'delete' ? 'primary' : 'secondary' }
                disabled={ formLocked }
                onClick={ () => onPickAction('delete') }
              >
                { i18n.translate('action-delete') }
              </s-button>
              {/* Later: Add items / Remove items when listMode */}
            </s-stack>

            { action === 'delete' && selected && (
              <s-text-field
                label={ i18n.translate('delete-confirm-label', {
                  namespace: selected.namespace,
                  key: selected.key,
                  count,
                }) }
                value={ deleteConfirm }
                disabled={ formLocked }
                onChange={ (e) => setDeleteConfirm(e.currentTarget.value) }
              />
            ) }

            { action === 'set' && selected && !listMode && (
              <ScalarInput
                type={ selected.type }
                value={ scalarValue }
                disabled={ formLocked }
                label={ i18n.translate('value-label') }
                i18n={ i18n }
                onChange={ setScalarValue }
              />
            ) }

            { action === 'set' && selected && listMode && (
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="small" alignItems="end">
                  <s-box inlineSize="100%">
                    <ScalarInput
                      type={ scalarTypeOf(selected.type) }
                      value={ listDraft }
                      disabled={ formLocked }
                      label={ i18n.translate('value-label') }
                      i18n={ i18n }
                      onChange={ setListDraft }
                    />
                  </s-box>
                  <s-button disabled={ formLocked } onClick={ tryAddListItem }>
                    { i18n.translate('list-add') }
                  </s-button>
                </s-stack>

                { listItems.length === 0 ? (
                  <s-text color="subdued">{ i18n.translate('list-empty') }</s-text>
                ) : (
                  <s-stack direction="inline" gap="small">
                    { listItems.map((item) => (
                      <s-stack key={ item } direction="inline" gap="none" alignItems="center">
                        <s-badge>{ item }</s-badge>
                        <s-button
                          variant="tertiary"
                          disabled={ formLocked }
                          accessibilityLabel={ `Remove ${ item }` }
                          onClick={ () => removeListItem(item) }
                        >
                          <s-icon type="x-circle" />
                        </s-button>
                      </s-stack>
                    )) }
                  </s-stack>
                ) }
              </s-stack>
            ) }
          </s-stack>
        ) }

        { isSubmitting && (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-spinner />
            <s-text>{ i18n.translate('editing') }</s-text>
          </s-stack>
        ) }

        { isSuccess && (
          <s-banner tone="success">
            <s-text>{ i18n.translate('success', { count }) }</s-text>
          </s-banner>
        ) }

        { isError && (
          <s-stack direction="block" gap="base">
            <s-banner tone="critical">
              <s-text>{ i18n.translate('error', { message: errorMessage }) }</s-text>
            </s-banner>
            <s-banner tone="warning">
              <s-text>{ i18n.translate('partial-note') }</s-text>
            </s-banner>
          </s-stack>
        ) }
      </s-stack>
    </s-admin-action>
  );
}

function ScalarInput({ type, value, disabled, label, i18n, onChange }) {
  if (type === 'boolean') {
    return (
      <s-select
        label={ label }
        value={ value || 'true' }
        disabled={ disabled }
        onChange={ (e) => onChange(e.currentTarget.value) }
      >
        <s-option value="true">{ i18n.translate('boolean-true') }</s-option>
        <s-option value="false">{ i18n.translate('boolean-false') }</s-option>
      </s-select>
    );
  }

  if (type === 'number_integer' || type === 'number_decimal') {
    return (
      <s-number-field
        label={ label }
        value={ value }
        disabled={ disabled }
        step={ type === 'number_integer' ? 1 : 0.01 }
        onChange={ (e) => onChange(e.currentTarget.value) }
      />
    );
  }

  return (
    <s-text-field
      label={ label }
      value={ value }
      disabled={ disabled }
      onChange={ (e) => onChange(e.currentTarget.value) }
    />
  );
}
