import osc from 'osc';

const PORT = Number(process.env.AEI_OSC_LISTEN_PORT || 9000);

const receiver = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: PORT,
  metadata: true,
});

receiver.on('ready', () => {
  console.log(`AEI OSC Test Receiver listening on udp://0.0.0.0:${PORT}`);
  console.log('Expected message: /aei/fader/1 <float 0..1>');
});

receiver.on('message', (message, timeTag, info) => {
  const value = message.args?.[0]?.value;
  const stamp = new Date().toISOString();
  console.log(`${stamp} ${info?.address || ''}:${info?.port || ''}  ${message.address}  ${Number(value).toFixed(3)}`);
});

receiver.on('error', (error) => console.error('[OSC receiver] error', error));
receiver.open();
