import { Tag } from '@blueprintjs/core';
import { calc_mtn_window } from 'main/apidata';


export const MaintenanceCell = (props) => {
    const last_confirmed_height = props?.data?.last_confirmed_height;
    const gstore = props?.data?.gstore;
    const mtn = gstore ? calc_mtn_window(last_confirmed_height, gstore.current_block_height) : undefined;

    const is_mtn_closed = typeof mtn === 'string' && mtn.toLowerCase() === 'closed';

    if (is_mtn_closed)
        return (
            <Tag className='closed-maintenance-window maintenance-width' round large intent='warning' rightIcon='issue' color='white'>
                {mtn}
            </Tag>
        );

    return (
        <Tag className='maintenance-width' round large intent='success' rightIcon='tick-circle'>
            {mtn}
        </Tag>
    );
}