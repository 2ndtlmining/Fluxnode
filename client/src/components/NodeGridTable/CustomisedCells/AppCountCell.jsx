import { Tag } from '@blueprintjs/core';

export const AppCountCell = (props) => {
    let dashboardUrl = `http://${props?.data?.ip_full.host}:${props?.data?.ip_full.active_port_os}`;
    let appCount = props.value;

    return (
        <a target='_blank' href={`${dashboardUrl}/apps/localapps`}>
            <Tag round minimal large interactive intent={appCount == 0 ? 'none' : 'success'}>
                {appCount}
            </Tag>
        </a>
    )
}