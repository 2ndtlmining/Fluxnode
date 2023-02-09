import { fluxos_version_string, fv_compare } from 'main/flux_version';
export const BenchVersionCell = (props) => {
    const benchVersion = props?.value;
    const gstore = props?.data?.gstore;

    const is_bench_outdated = benchVersion && gstore ? fv_compare(benchVersion, gstore?.bench_latest_version) == -1 : true;

    return (
        <span className={is_bench_outdated ? 'fw-bolder outdated-flux-ver' : ''}>
            {fluxos_version_string(benchVersion)}
        </span>
    );
};
