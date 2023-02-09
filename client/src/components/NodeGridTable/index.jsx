import { useState, useRef, useCallback, useEffect } from 'react';
import './index.scss';
import { AgGridReact } from 'ag-grid-react';
import { IpCell } from './CustomisedCells/IpCell';
import { TierCell } from './CustomisedCells/TierCell';
import { BenchmarkCell } from './CustomisedCells/BenchmarkCell';
import { MaintenanceCell } from './CustomisedCells/MaintenanceCell';
import { FluxOSCell } from './CustomisedCells/FluxOSCell';
import { BenchVersionCell } from './CustomisedCells/BenchVersionCell';
import { NumberCell } from './CustomisedCells/NumberCell';
import { UptimeCell } from './CustomisedCells/UptimeCell';
import { AppCountCell } from './CustomisedCells/AppCountCell';
import CustomHeader from './CustomHeader';

export const NodeGridTable = ({ data, gstore, theme }) => {
    const gridRef = useRef();
    const [rowData, setRowData] = useState(data);
    const [appTheme, setAppTheme] = useState(theme)
    useEffect(() => {
        setRowData(data.map((x) => ({ ...x, gstore: gstore })))
        setAppTheme(theme)
    }, [data, gstore, theme])

    const sizeToFit = useCallback(() => {
        gridRef.current.api.sizeColumnsToFit();
    }, [data]);

    const autoSizeAll = useCallback(() => {
        if (data && data.length > 0) {
            const allColumnIds = [];
            gridRef.current.columnApi.getColumns().forEach((column) => {
                allColumnIds.push(column.getId());
            });
            gridRef.current.columnApi.autoSizeColumns(allColumnIds, false);
        }

    }, [data]);

    const defaultColDef = {
        resizable: true,
        minWidth: 150,
        cellClass: 'grid-cell',
        sortable: true,
        headerComponent: CustomHeader,
        headerComponentParams: {
            gstore: gstore,
        },
        cellStyle: {
            color: 'inherit'
        }
    };

    const columnDefs = [
        { field: 'ip_full', headerName: 'IP', cellRenderer: 'ipCell', sortable: false },
        { field: 'tier', headerName: 'Tier', cellRenderer: 'tierCell', filter: 'agTextColumnFilter', },
        { field: 'rank', headerName: 'Rank', filter: 'agTextColumnFilter', },
        { field: 'last_reward', headerName: 'Last Reward' },
        { field: 'next_reward', headerName: 'Next Reward' },
        { field: 'benchmark_status', headerName: 'Benchmark', cellRenderer: 'benchmarkCell', filter: 'agTextColumnFilter', },
        { field: 'last_confirmed_height', headerName: 'Maintenance', cellRenderer: 'maintenanceCell', filter: 'agTextColumnFilter', },
        { field: 'flux_os', headerName: 'Flux OS', cellRenderer: 'fluxOSCell', sortable: false },
        { field: 'bench_version', headerName: 'Flux Bench version', cellRenderer: 'benchVersionCell', minWidth: 200, sortable: false },
        { field: 'eps', headerName: 'EPS', cellRenderer: 'numberCell', refData: { 'toFixed': '2' }, filter: 'agNumberColumnFilter' },
        { field: 'ram', headerName: 'RAM', cellRenderer: 'numberCell', refData: { 'toFixed': '2', 'postText': 'GB' }, filter: 'agNumberColumnFilter' },
        { field: 'cores', headerName: 'Cores', cellRenderer: 'numberCell', filter: 'agNumberColumnFilter' },
        { field: 'threads', headerName: 'Threads', cellRenderer: 'numberCell', filter: 'agNumberColumnFilter' },
        { field: 'dws', headerName: 'DWS', cellRenderer: 'numberCell', refData: { 'toFixed': '2', filter: 'agNumberColumnFilter' } },
        { field: 'total_storage', headerName: 'Size', cellRenderer: 'numberCell', refData: { 'toFixed': '2', 'postText': 'GB' }, filter: 'agNumberColumnFilter', minWidth: 130 },
        { field: 'down_speed', headerName: 'Download', cellRenderer: 'numberCell', refData: { 'toFixed': '2', 'postText': 'Mb/s' }, filter: 'agNumberColumnFilter', minWidth: 140 },
        { field: 'up_speed', headerName: 'Upload', cellRenderer: 'numberCell', refData: { 'toFixed': '2', 'postText': 'Mb/s' }, filter: 'agNumberColumnFilter', minWidth: 130 },
        { field: 'last_benchmark', headerName: 'Last Benchmark', width: '200px' },
        { field: 'uptime', headerName: 'Uptime', filter: 'agNumberColumnFilter', cellRenderer: 'uptimeCell', width: '150px' },
        { field: 'appCount', headerName: 'Apps', filter: 'agNumberColumnFilter', cellRenderer: 'appCountCell' }
    ];

    return (
        <div className={appTheme === 'dark' ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'} style={{ height: '100%' }}>
            <AgGridReact
                autoSizeAllColumns={true}
                rowData={rowData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                ref={gridRef}
                onGridReady={sizeToFit}
                onFirstDataRendered={autoSizeAll}
                overlayNoRowsTemplate={'<span>No Nodes</span>'}
                frameworkComponents={{
                    ipCell: IpCell,
                    tierCell: TierCell,
                    benchmarkCell: BenchmarkCell,
                    maintenanceCell: MaintenanceCell,
                    fluxOSCell: FluxOSCell,
                    benchVersionCell: BenchVersionCell,
                    numberCell: NumberCell,
                    uptimeCell: UptimeCell,
                    appCountCell: AppCountCell
                }}
            />
        </div>
    );
};
