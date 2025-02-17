import { Tag } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';


export const AppCountCell = (props) => {
    let appCount = props.value;
    let installedApps = props.data.installedApps;

    return (
        <Tooltip2
            intent='danger'
            placement='top'
            usePortal={true}
            transitionDuration={100}
            hoverOpenDelay={60}
            content={
            installedApps?.length ? (
                <div style={{ maxWidth: 300 }}>
                <div>
                    <strong>{appCount} apps:</strong>
                </div>
                {installedApps.map((app) => (
                    <div key={app.hash}>
                    <hr />
                    <strong>{app.name}</strong> - <em>{app.description}</em>
                    </div>
                ))}
                </div>
            ) : null
            }
        >
            <Tag round minimal large intent={appCount == 0 ? 'none' : 'success'}>
                {appCount}
            </Tag>
        </Tooltip2>
    )
}