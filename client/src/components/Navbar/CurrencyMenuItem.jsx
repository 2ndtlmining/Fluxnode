import { Select2 } from '@blueprintjs/select';
import { Button, Label } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';

import { SUPPORTED_CURRENCIES } from 'currency';

export function CurrencyMenuItem({ currencyRates, selectedCurrency, onChange }) {
  // Order by SUPPORTED_CURRENCIES rather than whatever order the rates object
  // happens to have, so USD stays first and the menu does not reshuffle when
  // the API changes its response order.
  const currencyOptions =
    currencyRates === null
      ? ['USD']
      : [
          ...SUPPORTED_CURRENCIES.filter((c) => c in currencyRates),
          ...Object.keys(currencyRates).filter((c) => !SUPPORTED_CURRENCIES.includes(c))
        ];

  return (
    <Select2
      items={currencyOptions}
      popoverProps={{ matchTargetWidth: true, minimal: true }}
      itemRenderer={(val, itemProps) => {
        return (
          <MenuItem2
            key={val}
            text={val}
            onClick={(elm) => {
              onChange({ currency: elm.target.textContent, rate: currencyRates[elm.target.textContent] });
            }}
          />
        );
      }}
      onItemSelect={() => {}}
    >
      <div styles={{ display: 'flex' }} className='currency-menu'>
        <Label className='currency-label'>Currency</Label>
        <Button className='currency-select' text={selectedCurrency.currency} />
      </div>
    </Select2>
  );
}
