import { getreq } from 'content/index';
import { useState } from 'react';

export const NumberCell = (props) => {
    const data = props.data;
    const postText = props?.colDef.refData?.postText
    let toFixedVal = 0;

    if (!data) return undefined;

    if (props?.colDef?.refData?.toFixed) {
        toFixedVal = parseInt(props.colDef.refData.toFixed, 10);
    }

    const _fs_compare = (node, req, keyNode, keyReq = null) => {
        if (keyReq == null) keyReq = keyNode;
        return !node[keyNode] || !req[keyReq] || node[keyNode] < req[keyReq];
    }

    const _failed_specs = (node) => {

        const { tier, thunder } = node;
        let reqObj = {};
        if (tier == 'CUMULUS') {
            reqObj = thunder ? getreq('fractus', true) : getreq('cumulus', true);
        }
        else if (tier == 'NIMBUS') reqObj = getreq('nimbus', true);
        else if (tier == 'STRATUS') reqObj = getreq('stratus', true);

        const failed = {};
        // prettier-ignore
        // eslint-disable-next-line no-lone-blocks
        {
            failed.threads = _fs_compare(node, reqObj, 'threads');
            // Allow a difference of 3 GB since RAM sizes are mosty a few gigs short when reported
            failed.ram = !node.ram || !reqObj.ram || reqObj.ram - node.ram > 3.0;
            failed.dws = _fs_compare(node, reqObj, 'dws');
            failed.eps = _fs_compare(node, reqObj, 'eps');

            failed.total_storage = _fs_compare(node, reqObj, 'total_storage', 'size');
            failed.down_speed = _fs_compare(node, reqObj, 'down_speed', 'net_down_speed');
            failed.up_speed = _fs_compare(node, reqObj, 'up_speed', 'net_up_speed');
        }

        return failed;
    }

    const _FAILED_PROPS = { className: 'text-danger fw-bolder' };

    const MarkIfFailed = (failureInfo) => (name) => failureInfo[name] ? _FAILED_PROPS : {};

    const flp = MarkIfFailed(_failed_specs(data));

    return (
        <span {...flp(props?.colDef?.field)}>{parseFloat(props.value).toFixed(toFixedVal)} {postText}</span>
    )
}