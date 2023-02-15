import React, { Component } from 'react';
import { Icon } from '@blueprintjs/core';
import { CustomTooltip } from './CustomTooltip';

export default class CustomHeader extends Component {
    constructor(props) {
        super(props);

        this.state = {
            ascSort: 'inactive',
            descSort: 'inactive',
            noSort: 'inactive'
        };

        props.column.addEventListener('sortChanged', this.onSortChanged.bind(this));
    }

    componentDidMount() {
        this.onSortChanged();
    }

    render() {
        let menu = null;
        if (this.props.enableMenu) {
            menu = (
                <div
                    ref={(menuButton) => {
                        this.menuButton = menuButton;
                    }}
                    className='customHeaderMenuButton'
                    onClick={this.onMenuClicked.bind(this)}
                >
                    <Icon className='header-icon' icon='filter-list' size={12} />
                </div>
            );
        }

        let tooltip = null;
        if (this.props.column?.colId) {
            tooltip = <CustomTooltip
                componentName={this.props.column?.colId}
                displayName={this.props.displayName}
                gstore={this.props.gstore} />;
        }

        let sort = null;
        if (this.props.enableSorting) {
            sort = (
                <div style={{ display: 'inline-block', paddingLeft: '3px' }}>
                    {this.state.ascSort === 'active' ?
                        <div
                            onClick={this.onSortRequested.bind(this, 'desc')}
                            onTouchEnd={this.onSortRequested.bind(this, 'desc')}
                            className={`customSortDownLabel ${this.state.ascSort}`}
                        >
                            <Icon className='header-icon' icon='arrow-down' size={12} />
                        </div> : undefined
                    }
                    {this.state.descSort === 'active' ?
                        <div
                            onClick={this.onSortRequested.bind(this, 'no')}
                            onTouchEnd={this.onSortRequested.bind(this, 'no')}
                            className={`customSortUpLabel ${this.state.descSort}`}
                        >
                            <Icon className='header-icon' icon='arrow-up' size={12} />
                        </div> : undefined
                    }
                    {this.state.noSort === 'active' ?
                        <div
                            onClick={this.onSortRequested.bind(this, 'asc')}
                            onTouchEnd={this.onSortRequested.bind(this, 'asc')}
                            className={`customSortUpLabel ${this.state.noSort}`}
                        >
                            <Icon className='header-icon' icon='arrows-vertical' size={12} />
                        </div> : undefined
                    }

                </div>
            );
        }

        return (
            <div className='custom-header'>
                <div className='custom-header-centre'>
                    {menu}
                    <div className='label'>{tooltip ? tooltip : this.props.displayName}</div>
                    {sort}
                </div>
            </div>
        );
    }

    onMenuClicked() {
        this.props.showColumnMenu(this.menuButton);
    }

    onSortChanged() {
        this.setState({
            ascSort: this.props.column.isSortAscending() ? 'active' : 'inactive',
            descSort: this.props.column.isSortDescending() ? 'active' : 'inactive',
            noSort: !this.props.column.isSortAscending() && !this.props.column.isSortDescending() ? 'active' : 'inactive'
        });
    }

    onSortRequested(order, event) {
        this.props.setSort(order, event.shiftKey);
    }
}
