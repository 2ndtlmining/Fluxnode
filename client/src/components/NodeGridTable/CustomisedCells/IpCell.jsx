import { LayoutContext } from "contexts/LayoutContext";
import { hide_sensitive_number } from 'utils';

export const IpCell = (props) => {
    const ipFull = props.data.ip_full;
    const ipDisplay = props.value

    if (!ipFull) return undefined;

    const dashboardUrl = `http://${ipFull.host}:${ipFull.active_port_os}`;
    return (
        <LayoutContext.Consumer>
            {({ enablePrivacyMode }) => (
                <>
                    {ipDisplay ? (
                        <a target='_blank' href={dashboardUrl}>
                            {!enablePrivacyMode ? ipDisplay : hide_sensitive_number(ipDisplay)}
                        </a>
                    ) : (
                        <span>'-'</span>
                    )}
                </>
            )}
        </LayoutContext.Consumer>
    )
}