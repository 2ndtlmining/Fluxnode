/*
 * Total enterprise-node score for one wallet (issue #257).
 *
 * Extracted from MainApp so the "which address do we compare against" question
 * is answerable without a browser. The bug it fixes was invisible by
 * inspection: MainApp handed this the raw ?wallet= param, which LayoutContext
 * has already MASKED when Privacy Mode is on, so the comparison ran against a
 * row of X's and summed to zero. Nothing errored -- the figure simply read 0,
 * identical to a wallet that genuinely has no enterprise nodes.
 *
 * The rule the rest of the app follows since #256: the RESOLVED address is the
 * join key, and the masked form is only ever for display.
 */
export function sumEnterpriseScore(enterpriseNodes, walletAddress) {
  if (!walletAddress || !Array.isArray(enterpriseNodes)) return 0;

  return enterpriseNodes.reduce(
    (total, node) => (node?.payment_address === walletAddress ? total + (Number(node.score) || 0) : total),
    0
  );
}
