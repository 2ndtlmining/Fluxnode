import { format_seconds } from 'utils';

export const UptimeCell = (props) => {
    const uptime = props?.value

    if (!uptime) return undefined;

    return (
        <span>{format_seconds(uptime)}</span>
    )
}