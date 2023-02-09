import { Tag } from '@blueprintjs/core';

export const TierCell = (props) => {
    const tier = props?.data?.tier;
    const thunder = props?.data?.thunder;

    if (!tier) return undefined;

    if (tier == 'CUMULUS') {
        return thunder ? (
            <Tag large minimal intent='success'>
                FRACTUS
            </Tag>
        ) : (
            <Tag large minimal intent='primary'>
                CUMULUS
            </Tag>
        );
    }

    if (tier == 'NIMBUS')
        return (
            <Tag large minimal intent='warning'>
                NIMBUS
            </Tag>
        );

    if (tier == 'STRATUS')
        return (
            <Tag large minimal intent='danger'>
                STRATUS
            </Tag>
        );

    if (tier == 'FRACTUS')
        return (
            <Tag large minimal intent='success'>
                FRACTUS
            </Tag>
        );

    return (
        <Tag large minimal intent='none'>
            UNKNOWN
        </Tag>
    );
}