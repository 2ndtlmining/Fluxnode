import { LayoutContext } from "contexts/LayoutContext";
import { hide_sensitive_number } from 'utils';

export const IpCell = (props) => {
    const ipFull = props.value;
    const ipDisplay = props.data?.ip_display

    if (!ipFull) return undefined;

    const dashboardUrl = `http://${ipFull.host}:${ipFull.active_port_os}`;
    return (
        <LayoutContext.Consumer>
            {({ enablePrivacyMode }) => (
                <td className='al'>
                    {ipDisplay ? (
                        <a target='_blank' href={dashboardUrl}>
                            {!enablePrivacyMode ? ipDisplay : hide_sensitive_number(ipDisplay)}
                        </a>
                    ) : (
                        '-'
                    )}
                </td>
            )}
        </LayoutContext.Consumer>
    )
}