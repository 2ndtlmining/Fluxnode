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
import { fluxos_version_string } from 'main/flux_version';
import { dateComparator, nextRewardComparator, isIOS } from 'utils';
import { Button } from '@blueprintjs/core';

export const NodeGridTable = ({
  data,
  gstore,
  theme,
  handleRefreshClick,
  loadingNodeList,
  noAddress,
  isMaximize,
  isFullScreen,
  onToggleFullScreen
}) => {
  const gridRef = useRef();
  const [rowData, setRowData] = useState(data);
  const [appTheme, setAppTheme] = useState(theme);
  const [ipFilter, setIpFilter] = useState('');

  useEffect(() => {
    setRowDataBasedUponFilter(ipFilter, setRowData, data, gstore);
    setAppTheme(theme);
  }, [data, gstore, theme, ipFilter]);

  const setRowDataBasedUponFilter = (inputValue, setRowData, data, gstore) => {
    const filterFunction = (x) => x.ip_display.includes(inputValue);

    setRowData(
      data.map((x) => ({
        ...x,
        gstore: gstore,
        flux_os_display: fluxos_version_string(x.flux_os),
        bench_version_display: fluxos_version_string(x.bench_version),
      }))
        .filter(inputValue === '' ? () => true : filterFunction)
    );
  };

  const sizeToFit = useCallback(() => {
    gridRef.current.api.sizeColumnsToFit();
  }, [data]);

  const reloadColumnState = () => {
    var columnState = JSON.parse(localStorage.getItem('myColumnState'));
    if (columnState) {
      gridRef.current.columnApi.applyColumnState({ state: columnState, applyOrder: true });
    }
  };

  const onGridReady = () => {
    reloadColumnState();
    sizeToFit();
  };

  const autoSizeAll = useCallback(() => {
    if (data && data.length > 0) {
      const allColumnIds = [];
      gridRef.current.columnApi.getColumns().forEach((column) => {
        allColumnIds.push(column.getId());
      });
      gridRef.current.columnApi.autoSizeColumns(allColumnIds, false);
    }
    reloadColumnState();
  }, [data]);

  const onColumnMoved = (params) => {
    let columnState = JSON.stringify(params.columnApi.getColumnState());
    localStorage.setItem('myColumnState', columnState);
  };

  const handleResetColumnState = () => {
    gridRef.current.columnApi.resetColumnState();
    localStorage.removeItem('myColumnState');
  };

  const defaultColDef = {
    resizable: true,
    minWidth: 150,
    cellClass: 'grid-cell',
    sortable: true,
    headerComponent: CustomHeader,
    headerComponentParams: {
      gstore: gstore
    },
    cellStyle: {
      color: 'inherit'
    }
  };

  const columnDefs = [
    { field: 'ip_display', headerName: 'IP', cellRenderer: 'ipCell', filter: 'agTextColumnFilter', minWidth: 100 },
    { field: 'tier', headerName: 'Tier', cellRenderer: 'tierCell', filter: 'agTextColumnFilter', minWidth: 100 },
    { field: 'rank', headerName: 'Rank', filter: 'agTextColumnFilter', minWidth: 100 },
    { field: 'last_reward', headerName: 'Last Reward', comparator: dateComparator, filter: 'agTextColumnFilter' },
    { field: 'next_reward', headerName: 'Next Reward', filter: 'agTextColumnFilter', comparator: nextRewardComparator },
    { field: 'benchmark_status', headerName: 'Benchmark', cellRenderer: 'benchmarkCell', filter: 'agTextColumnFilter' },
    {
      field: 'last_confirmed_height',
      headerName: 'Maintenance',
      cellRenderer: 'maintenanceCell',
      filter: 'agTextColumnFilter'
    },
    {
      field: 'flux_os_display',
      headerName: 'Flux OS',
      cellRenderer: 'fluxOSCell',
      filter: 'agTextColumnFilter'
    },
    {
      field: 'bench_version_display',
      headerName: 'Flux Bench version',
      cellRenderer: 'benchVersionCell',
      filter: 'agTextColumnFilter',
      minWidth: 200
    },
    {
      field: 'eps',
      headerName: 'EPS',
      cellRenderer: 'numberCell',
      refData: { toFixed: '2' },
      filter: 'agNumberColumnFilter',
      minWidth: 100
    },
    {
      field: 'ram',
      headerName: 'RAM',
      cellRenderer: 'numberCell',
      refData: { toFixed: '2', postText: 'GB' },
      filter: 'agNumberColumnFilter',
      minWidth: 100
    },
    { field: 'threads', headerName: 'Threads', cellRenderer: 'numberCell', filter: 'agNumberColumnFilter' },
    {
      field: 'dws',
      headerName: 'DWS',
      cellRenderer: 'numberCell',
      refData: { toFixed: '2', filter: 'agNumberColumnFilter' },
      minWidth: 100
    },
    {
      field: 'total_storage',
      headerName: 'Size',
      cellRenderer: 'numberCell',
      refData: { toFixed: '2', postText: 'GB' },
      filter: 'agNumberColumnFilter',
      minWidth: 100
    },
    {
      field: 'down_speed',
      headerName: 'Download',
      cellRenderer: 'numberCell',
      refData: { toFixed: '2', postText: 'Mb/s' },
      filter: 'agNumberColumnFilter',
      minWidth: 100
    },
    {
      field: 'up_speed',
      headerName: 'Upload',
      cellRenderer: 'numberCell',
      refData: { toFixed: '2', postText: 'Mb/s' },
      filter: 'agNumberColumnFilter',
      minWidth: 100
    },
    { field: 'last_benchmark', headerName: 'Last Benchmark' },
    {
      field: 'uptime',
      headerName: 'Uptime',
      filter: 'agNumberColumnFilter',
      cellRenderer: 'uptimeCell',
      width: '150px',
      minWidth: 100
    },
    { field: 'score', headerName: 'Score', filter: 'agTextColumnFilter' },
    {
      field: 'appCount',
      headerName: 'Apps',
      filter: 'agNumberColumnFilter',
      cellRenderer: 'appCountCell',
      minWidth: 100
    }
  ];


  return (
    <>
      <div className='table-header'>
        <span className='title adp-text-normal'>
          Nodes Overview
          <br />
          <span className='adp-text-muted overview-info-subtitle'>
            Hover mouse over a column header to see more information.
          </span>
        </span>
        <div className='cta-button-wrapper'>
          <div>Filter (IP):&nbsp;
            <input type='text' value={ipFilter} onChange={(e) => setIpFilter(e.target.value)} size={16} />&nbsp;
            <Button text='Clear' intent='primary' rightIcon={"filter"} onClick={() => setIpFilter('')} />
          </div>&nbsp;
          <Button text='Reset' rightIcon='reset' intent='danger' onClick={handleResetColumnState} />
          <Button
            text='Refresh'
            rightIcon='refresh'
            intent='success'
            onClick={handleRefreshClick}
            disabled={loadingNodeList || noAddress}
            outlined={true}
          />
          {!isIOS() ? (
            <>
              <Button
                rightIcon={isMaximize ? 'minimize' : 'maximize'}
                onClick={() => this.setState((prev) => ({ isFullScreen: false, isMaximize: !prev.isMaximize }))}
                disabled={isFullScreen}
              />
              <Button
                rightIcon={isFullScreen ? 'arrow-bottom-right' : 'fullscreen'}
                onClick={() => onToggleFullScreen()}
              />
            </>
          ) : undefined}
        </div>
      </div>
      <div className={appTheme === 'dark' ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'} style={{ height: '100%' }}>
        <AgGridReact
          autoSizeAllColumns={true}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          ref={gridRef}
          onDragStopped={onColumnMoved}
          onGridReady={onGridReady}
          onFirstDataRendered={autoSizeAll}
          maintainColumnOrder={true}
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
    </>
  );
};
