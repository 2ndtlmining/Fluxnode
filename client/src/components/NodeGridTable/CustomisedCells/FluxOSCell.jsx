import { fluxos_version_string, fv_compare } from 'main/flux_version';
export const FluxOSCell = (props) => {
    const fluxos = props?.value;
    const gstore = props?.data?.gstore;

    const is_fluxos_outdated = fluxos && gstore ? fv_compare(fluxos, gstore?.fluxos_latest_version) == -1 : true;

    return (
        <span className={is_fluxos_outdated ? 'fw-bolder outdated-flux-ver' : ''}>
            {fluxos_version_string(fluxos)}
        </span>
    );
};
