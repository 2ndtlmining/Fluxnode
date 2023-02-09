import { Tag } from '@blueprintjs/core';
import { fv_compare } from 'main/flux_version';


export const BenchmarkCell = (props) => {
    const status = props?.data?.benchmark_status;
    const fluxos = props?.data?.flux_os;
    const gstore = props?.data?.gstore;

    const is_fluxos_outdated = fluxos && gstore ? fv_compare(fluxos, gstore?.fluxos_latest_version) == -1 : true;

    if (status == 'failed')
        return (
            <Tag round large intent='danger' rightIcon='error'>
                Failed
            </Tag>
        );

    if (status == 'passed') {
        const intent = is_fluxos_outdated ? 'warning' : 'success';
        return (
            <Tag round large intent={intent} rightIcon='tick-circle'>
                Passed
            </Tag>
        );
    }

    if (status == 'offline')
        return (
            <Tag round large minimal intent='warning' rightIcon='warning-sign'>
                Offline
            </Tag>
        );

    if (status == 'running')
        return (
            <Tag round minimal large intent='primary' rightIcon='time'>
                Running
            </Tag>
        );

    return (
        <Tag round large intent='none' rightIcon='lock'>
            Unknown
        </Tag>
    );
}