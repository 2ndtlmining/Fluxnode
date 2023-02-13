import { format_seconds } from 'utils';

export const UptimeCell = (props) => {
    const uptime = props?.value

    return <span>{uptime ? format_seconds(uptime) : 'Not active'}</span>
}