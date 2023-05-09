import React, { useState } from 'react';
import './guides.scss';

import { Helmet } from 'react-helmet';

import { AppNavbar } from 'components/Navbar';
import { setupVideos, guideVideos } from 'content/index';

import { Button, Card } from '@blueprintjs/core';
import Accordion from 'react-bootstrap/Accordion';

import { FooterRendered } from 'components/Footer';

import { RequirementsCumulus, RequirementsNimbus, RequirementsStratus, RequirementsFractus } from './NodeRequirements';

import { Container, Row, Col } from 'react-grid-system';
import { setGAEvent, setGAPageView } from 'g-analytic';

class AppGuidesView extends React.Component {
  componentDidMount() {
    if (window) {
      setGAPageView(window.location.pathname);
      setGAEvent({ category: 'GuidesPage', action: 'visit' })
    }
  }

  renderVideo(url, title) {
    return (
      <div key={title} className='mb-5 col col-12 col-md-6 col-lg-4'>
        <h5 className='mb-2 fs-6 text-truncate video-name'>{title}</h5>
        <iframe
          src={url + '?rel=0&controls=1&autoplay=0&mute=0&start=0'}
          style={{ width: '100%', height: '330px', pointerEvents: 'auto' }}
          allow='accelerometer; clipboard-write; autoplay; encrypted-media; encrypted-media; picture-in-picture;'
          allowFullScreen
          frameBorder='0'
          title={title}
        />
      </div>
    );
  }

  renderSetupVideos() {
    return setupVideos.map((v) => this.renderVideo(v.url, v.title));
  }

  renderGuideVideos() {
    return guideVideos.map((v) => this.renderVideo(v.url, v.title));
  }

  renderContent() {
    return (
      <>
        {/* ====================== */}

        <div className='adp-bg-normal rounded-2 py-4 px-4 shadow'>
          <h3 className='card-title guide-text'>Setup</h3>
          <hr />
          <div className='guide-text'>
            <h4 className='mt-4 mb-2 section-title'>Hardware</h4>
            <ul className='fs-6 ms-3'>
              <li>
                Seeed hardware:{' '}
                <a className='ms-1 link-primary' href='https://www.seeedstudio.com/flux'>
                  Click here to visit Seeed
                </a>
              </li>
              <li>
                Benchmarks:{' '}
                <a
                  className='ms-1 link-primary'
                  href='https://docs.google.com/spreadsheets/d/1qI6poLOieT3TgsAolFicYAyluby91F_BD4mcXblKP_8/edit?usp=sharing'
                >
                  Click here to check benchmarks.
                </a>
              </li>
            </ul>
            <h4 className='mt-4 mb-2 section-title'>VPS Option</h4>
            <ul className='fs-6 ms-3'>
              <li>
                Official List:{' '}
                <a
                  className='ms-1 link-primary'
                  href='https://docs.google.com/spreadsheets/d/1KJf9yI7RGl01ZgkWA8qVPQUwChEfe0JK2UGfubnq4Fw/edit#gid=0'
                >
                  Click here to view the official list.
                </a>
              </li>
            </ul>
            <h4 className='mt-4 mb-2 section-title'>Medium Guides</h4>
            <ul className='fs-6 ms-3'>
              <li>
                Installation:{' '}
                <a
                  className='ms-1 link-primary'
                  href='https://medium.com/@mmalik4/flux-light-node-setup-as-easy-as-it-gets-833f17c73dbb'
                >
                  Flux Light Node Setup — As easy as it gets !! | by Ali Malik | Medium
                </a>
              </li>
              <li>
                Multinode:{' '}
                <a
                  className='ms-1 link-primary'
                  href='https://medium.com/@oGGoldie/flux-multi-node-server-setup-7cd8887fe268'
                >
                  Flux Multi-Node Server Setup. Setup a dedicated server to run… | by Goldie | Medium
                </a>
              </li>
            </ul>
            <h4 className='mt-4 mb-2 section-title'>Video Guides</h4>
            <p className='fs-6 mt-3 mb-3 app-text-muted'>
              Setting up a FluxNode is easy, you just need to be comfortable with working on the command line. There are
              multiple ways to setup a FluxNode and here we share the most used ones for beginners. Below are a series
              of video guides which walk you through the setup process bit by bit.
            </p>
            <div className='container-fluid mt-4'>
              <div className='row'>{this.renderSetupVideos()}</div>
            </div>
          </div>
        </div>

        {/* ====================== */}

        <div className='mt-5 adp-bg-normal rounded-2 py-4 px-4 shadow'>
          <h3 className='card-title guide-text'>Hardware Requirements</h3>
          <hr />
          <div className='container-fluid mt-2'>
            <div className='row'>
              <div className='col col-12 col-md-6 col-lg-4 px-3 border-end adp-border-color'>{RequirementsCumulus}</div>
              <div className='col col-12 col-md-6 col-lg-4 px-3 border-end adp-border-color'>{RequirementsNimbus}</div>
              <div className='col col-12 col-lg-4 px-3'>{RequirementsStratus}</div>
            </div>
          </div>
        </div>

        {/* ====================== */}

        <div className='mt-5 adp-bg-normal rounded-2 py-4 px-4 shadow'>
          <h3 className='card-title guide-text'>Maintainance and Troubleshooting</h3>
          <hr />
          {this.renderMaintainance()}
        </div>

        {/* ====================== */}

        <div className='mt-5 adp-bg-normal rounded-2 py-4 px-4 shadow'>
          <h3 className='card-title guide-text'>Video Guides</h3>
          <hr />
          <p className='fs-6 mt-3 mb-3 guide-text app-text-muted'>
            Some other useful videos to help get familiar with Flux ecosystem.
          </p>
          <div className='container-fluid mt-4'>
            <div className='row'>{this.renderGuideVideos()}</div>
          </div>
        </div>

        {/* ====================== */}
      </>
    );
  }

  renderBullet(number) {
    return <span className='bp4-tag bp4-intent-primary fw-bold bp4-large bp4-minimal bp4-round me-2'>{number}</span>;
  }

  renderMaintainance() {
    const PANE_CLASSNAME = 'guide-text maintenance-faq mb-5 col col-12 col-lg-6';
    const leftPane = (
      <Accordion className={PANE_CLASSNAME}>
        <Accordion.Item eventKey='0'>
          <Accordion.Header>
            {this.renderBullet(1)} How to properly shut down a node if you need to do maintenance on the hardware side
            of things
          </Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`sudo systemctl shutdown`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='1'>
          <Accordion.Header>
            {this.renderBullet(2)} How to properly restart a node, i.e. what are the steps, do I need to do anything in
            Zelcore?
          </Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`sudo systemctl reboot`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='2'>
          <Accordion.Header>
            {this.renderBullet(3)} Always check zelcore if it was offline for an extended period to see if you need to
            start it in Zelcore. Always check your benchmark before you hit start in Zelcore
          </Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`fluxbench-cli getbenchmarks`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='3'>
          <Accordion.Header>{this.renderBullet(4)} If it fails benchmark restart the benchmark</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`fluxbench-cli restartnodebenchmarks`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='4'>
          <Accordion.Header>{this.renderBullet(5)} To view the most recent entries of your logs run</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`tail -F .fluxbenchmark/debug.log`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='5'>
          <Accordion.Header>{this.renderBullet(6)} To check benchmark</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`tail -F benchmark_debug_error.log`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='6'>
          <Accordion.Header>{this.renderBullet(7)} To check benchmark errors</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`tail -F ~/.flux/debug.log`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='7'>
          <Accordion.Header>{this.renderBullet(8)} To check daemon</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`tail -F flux_daemon_debug_error.log`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='8'>
          <Accordion.Header>{this.renderBullet(9)} To check daemon errors</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`tail -F ~/zelflux/error.log`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='9'>
          <Accordion.Header>{this.renderBullet(10)} To check the full error log</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following command</p>
            {CodeBlock.Full(`tail -F ~/watchdog/watchdog_error.log`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='10'>
          <Accordion.Header>{this.renderBullet(11)} Patching</Accordion.Header>
          <Accordion.Body>
            <p className='mb-2'>Run the following series of commands</p>
            <CodeBlock.FullC style={{ whiteSpace: 'pre-wrap' }}>
              sudo apt-get update -y && sudo apt-get --with-new-pkgs upgrade -y && sudo apt autoremove -y && cd zelflux
              && git checkout . && git checkout master && git reset && git pull && sudo reboot
            </CodeBlock.FullC>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='11'>
          <Accordion.Header>
            {this.renderBullet(12)} If your SSD size is showing as 100GB then you left LVM turned on when installing
            Ubuntu
          </Accordion.Header>
          <Accordion.Body>
            <p>First run the command</p>
            {CodeBlock.Full(`lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv`)}
            <p>After that run</p>
            {CodeBlock.Full(`fluxbench-cli restartnodebenchmarks`)}
            <p>
              After that wait for a few minutes (about 5) then run
              {CodeBlock.Inline(`fluxbench-cli getbenchmarks`)} again
            </p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='12'>
          <Accordion.Header>{this.renderBullet(13)} What is FLUX-TOKEN?</Accordion.Header>
          <Accordion.Body>
            <p>
              They are claimable in the Fusion app inside Zelcore. Select <strong>Parallel Mining Claim</strong> from
              the three dots top right. You will only see a claimable amount if your Flux-Token amount is higher than
              the fees required to claim. To see your Parallel Asset balance return to the home screen and specify your
              wallet address and hit the search button.
            </p>
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    );

    const rightPane = (
      <Accordion className={PANE_CLASSNAME}>
        <Accordion.Item eventKey='1'>
          <Accordion.Header>{this.renderBullet(14)} How to add your KDA address to your node?</Accordion.Header>
          <Accordion.Body>
            <p>
              To add a KDA address to your node go to http://nodeip/:port/fluxadmin/manageflux and enter your{' '}
              <i>k: address</i> If you are not familiar with KDA then use chain 0. To get your k: address from Zelcore,
              click "Manage Assets", add Kadena, then click on receive to get your address. Always use the address
              beginning with k:
            </p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='2'>
          <Accordion.Header>
            {this.renderBullet(15)} Getting an error that states "Not possible to get computer hardware specifications"
          </Accordion.Header>
          <Accordion.Body>
            <p>
              Usually it means you did not install Ubuntu in English language. Set the english numeric locale on the
              VPS/Server you are using for the fluxnode.
            </p>
            <p>To perform it:</p>
            <ul className='mn-list'>
              <li>
                Run
                {CodeBlock.Inline(`sudo bash -c 'echo "LC_NUMERIC="en_US.UTF-8"" >> /etc/default/locale'`)}
              </li>
              <li>Restart your VPS/Server with sudo reboot</li>
              <li>
                After it has rebooted run the command
                {CodeBlock.Inline(`locale | grep LC_NUMERIC`)}
              </li>
            </ul>
            <p>The result should show:</p>
            {CodeBlock.Full(`LC_NUMERIC=en_US.UTF-8`)}
            <p>Now run:</p>
            {CodeBlock.Full(`awk -F: '{ print $1 }' /etc/passwd`)}
            <p>You will see the flux username you created somewhere in the list when you run the command.</p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='3'>
          <Accordion.Header>
            {this.renderBullet(16)} Getting error that states "Failed: Not possible to get speed test"
          </Accordion.Header>
          <Accordion.Body>
            <p>
              Usually means you have an old version of Ubuntu installed or have other speedtest software on your server
              which is conflicting. Run the following series of commands.
            </p>
            {CodeBlock.Full(`
pm2 stop flux
sudo apt-get remove speedtest
sudo apt install speedtest-cli
pm2 start flux
fluxbench-cli restartnodebenchmarks
    `)}
            <p>wait 5 mins then run</p>
            {CodeBlock.Full(`fluxbench-cli getbenchmarks`)}
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='4'>
          <Accordion.Header>{this.renderBullet(17)} How to stop your node?</Accordion.Header>
          <Accordion.Body>
            <p>
              Run
              {CodeBlock.Inline(`pm2 stop all`)} followed by
              {CodeBlock.Inline(`sudo systemctl stop zelcash`)}
            </p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='5'>
          <Accordion.Header>{this.renderBullet(18)} Commands to Manage Flux Daemon</Accordion.Header>
          <Accordion.Body>
            <ul className='mn-list'>
              <li>
                Start Flux Daemon:
                {CodeBlock.Inline(`sudo systemctl start zelcash`)}
              </li>
              <li>
                Stop Flux Daemon:
                {CodeBlock.Inline(`sudo systemctl stop zelcash`)}
              </li>
              <li>
                Help List:
                {CodeBlock.Inline(`flux-cli help`)}
              </li>
            </ul>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='6'>
          <Accordion.Header>{this.renderBullet(19)} Commands to Manage Benchmarks</Accordion.Header>
          <Accordion.Body>
            <ul className='mn-list'>
              <li>
                Get info:
                {CodeBlock.Inline(`fluxbench-cli getinfo`)}
              </li>
              <li>
                Check benchmark:
                {CodeBlock.Inline(`fluxbench-cli getbenchmarks`)}
              </li>
              <li>
                Restart benchmark:
                {CodeBlock.Inline(`fluxbench-cli restartnodebenchmarks`)}
              </li>
              <li>
                Stop benchmark:
                {CodeBlock.Inline(`fluxbench-cli stop`)}
              </li>
              <li>
                Start benchmark:
                {CodeBlock.Inline(`sudo systemctl restart zelcash`)}
              </li>
            </ul>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='7'>
          <Accordion.Header>{this.renderBullet(20)} Commands to Manage Flux</Accordion.Header>
          <Accordion.Body>
            <ul className='mn-list'>
              <li>
                Summary info:
                {CodeBlock.Inline(`pm2 info flux`)}
              </li>
              <li>
                Logs in real time:
                {CodeBlock.Inline(`pm2 monit`)}
              </li>
              <li>
                Stop Flux:
                {CodeBlock.Inline(`pm2 stop flux`)}
              </li>
              <li>
                Start Flux:
                {CodeBlock.Inline(`pm2 start flux`)}
              </li>
            </ul>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='8'>
          <Accordion.Header>{this.renderBullet(21)} Commands to Manage the Watchdog</Accordion.Header>
          <Accordion.Body>
            <ul className='mn-list'>
              <li>
                Stop watchdog:
                {CodeBlock.Inline(`pm2 stop watchdog`)}
              </li>
              <li>
                Start watchdog:
                {CodeBlock.Inline(`pm2 start watchdog --watch`)}
              </li>
              <li>
                Restart watchdog:
                {CodeBlock.Inline(`pm2 reload watchdog --watch`)}
              </li>
              <li>
                Error logs:
                {CodeBlock.Inline(`~/watchdog/watchdog_error.log`)}
              </li>
              <li>
                Logs in real time:
                {CodeBlock.Inline(`pm2 monit`)}
              </li>
            </ul>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='9'>
          <Accordion.Header>{this.renderBullet(22)} How to restart MangoDB</Accordion.Header>
          <Accordion.Body>
            <p>Run the following sequence of commands</p>
            {CodeBlock.Full(`
sudo systemctl restart mongod
pm2 restart flux
sudo systemctl restart zelcash
    `)}
            <p>
              Only the second command will show an output. Then after about 5 minute check benchmarks again with
              {CodeBlock.Inline(`fluxbench-cli getbenchmarks`)}
            </p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='10'>
          <Accordion.Header>{this.renderBullet(23)} Slow Disk Write Speed (DWS) on a Raspberry pi</Accordion.Header>
          <Accordion.Body>
            <p>
              Check you have the SSD connected to the USB 3 (blue) port and its formatted in ext4, if you have an
              enclosure check it has UASP port.
            </p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='11'>
          <Accordion.Header>{this.renderBullet(24)} What is a Maintenance Window?</Accordion.Header>
          <Accordion.Body>
            <p>
              A Flux node is confirmed on the Flux network every 120 to 160 blocks, thus 240 to 320 minutes. Maintenance
              is allowed between confirmation to perform patching, updates or any needed maintenance on your node
              without losing your place in the queue.
            </p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey='12'>
          <Accordion.Header>{this.renderBullet(25)} Troubleshoot with Fluxnode viewer created by Car </Accordion.Header>
          <Accordion.Body>
            <p>Run the following command:</p>
            {CodeBlock.Full(`
bash -i <(curl -s https://raw.githubusercontent.com/JKTUNING/Flux-Node-Tools/main/flux_node_viewer.sh)
`)}
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    );

    return (
      <div className='container-fluid m-0'>
        <div className='row gx-3'>
          {leftPane}
          {rightPane}
        </div>
      </div>
    );
  }

  render() {
    return (
      <>
        <Helmet>
          <title>Guides</title>
        </Helmet>
        <div className='p-2 p-sm-3 p-md-5' style={{ minHeight: '60vh' }}>
          {this.renderContent()}
        </div>
      </>
    );
  }
}

const CodeBlock = {};

CodeBlock._Impl_Full = (children, otherProps = {}) => (
  <pre {...otherProps} className='tb-code'>
    {children}
  </pre>
);
CodeBlock._Impl_Inline = (children, otherProps = {}) => (
  <span {...otherProps} className='tb-code code-inline'>
    {children}
  </span>
);

CodeBlock.Full = (codeStr, otherProps = {}) => CodeBlock._Impl_Full(codeStr.trim(), otherProps);
CodeBlock.Inline = (codeStr, otherProps = {}) => CodeBlock._Impl_Inline(codeStr.trim(), otherProps);

CodeBlock.FullC = ({ children: codeStr, ...otherProps }) => CodeBlock._Impl_Full(codeStr, otherProps);
CodeBlock.InlineC = ({ children: codeStr, ...otherProps }) => CodeBlock._Impl_Inline(codeStr, otherProps);

export default AppGuidesView;
