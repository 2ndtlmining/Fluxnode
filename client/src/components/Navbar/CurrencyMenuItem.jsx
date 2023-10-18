import { Select2 } from '@blueprintjs/select';
import { Button, Label } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';

export function CurrencyMenuItem({ currencyRates, selectedCurrency, onChange }) {
  const currencyOptions = currencyRates === null ? ['USD'] : Object.entries(currencyRates).map(([currency, rate]) => currency);

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
