/*
 * Layered Image Serving recipes used when a Dynamic Media template is not
 * (yet) published. Each recipe maps the block's $params to a composite URL.
 * Ported from trpparts/blocks/cards-offers.
 */

function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function rtf(text, color, size, tracking = 'expndtw0') {
  const escaped = text.replace(/\r\n?/g, '\n').replace(/[\\{}\n\u0080-\uFFFF]/g, (char) => {
    if (char === '\n') return '\\line ';
    if ('\\{}'.includes(char)) return `\\${char}`;
    const code = char.charCodeAt(0);
    return `\\u${code > 32767 ? code - 65536 : code}?`;
  });
  const [red, green, blue] = color;
  return `{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red${red}\\green${green}\\blue${blue};}\\f0\\b\\cf1\\fs${size}\\${tracking} ${escaped}}`;
}

function nestedText(company, text, color, fontSize, inputSize, outputSize) {
  const hex = color.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `is(${company}/?layer=0&text=${encode(rtf(text, color, fontSize))}`
    + `&textAttr=288%2Cnorm%2CfixedRes%2Cnowrap&size=${encode(inputSize)}`
    + `&effect=-1&op_grow=3&color=0x${hex}&blendMode=norm&opac=100&op_blur=0`
    + `&pos=0%2C0&layer=comp&wid=${outputSize[0]}&hei=${outputSize[1]}&fit=stretch%2C1)`;
}

function trpOffer(server, params) {
  const bg = params.bg || 'CEM/trp-offer-background';
  const [company] = bg.split('/');
  const black = [0, 0, 0];
  const red = [229, 28, 16];
  const small = params.discount1 || '';
  const large = params.discount2 || '';
  const layers = [`layer=0&src=${encode(bg)}&size=500,667&origin=0,0`];
  const image = (layer, source, size, position) => {
    layers.push(`layer=${layer}&src=${source}&anchor=0,0&size=${size}&pos=${position}`);
  };
  const text = (layer, value, color, fontSize, size, position, renderer = 'textPs') => {
    layers.push(`layer=${layer}&${renderer}=${encode(rtf(value, color, fontSize, 'expnd2'))}`
      + `&textAttr=72,norm,fixedRes,wrap&anchor=0,0&size=${size}&pos=${position}`);
  };
  const nested = (...args) => nestedText(company, ...args);

  image(1, nested(params.headline || 'SPECIAL OFFER', black, 80, '1560,240', [1560, 360]), '390,90', '60,78');
  if (params.line1) text(2, params.line1, black, 32, '195,24', '61,170');
  if (params.line2) text(3, params.line2, black, 32, '195,43', '299,154');
  if (small) {
    // Two digits need the wider input canvas to avoid Scene7 cropping the second digit.
    const wide = small.length > 1;
    const width = wide ? 500 : 256;
    image(4, nested('$', red, 50, '72,128', [72, 192]), '18,48', '61,193');
    image(5, nested(small, red, 178, `${width},400`, [width, 600]), wide ? '125,150' : '64,150', '78,184');
    image(6, nested('OFF', red, 44, '200,128', [200, 192]), '50,48', wide ? '193,194' : '132,194');
  }
  if (large) {
    image(7, nested('$', red, 50, '72,128', [72, 192]), '18,48', '267,193');
    image(8, nested(large, red, 178, '500,440', [500, 660]), '125,165', '283,184');
    image(9, nested('OFF', red, 44, '200,128', [200, 192]), '50,48', '392,194');
  }
  if (params.product) image(10, encode(params.product), '500,230', '50,350');
  if (params.expiry) text(11, params.expiry, [255, 255, 255], 22, '215,24', '278,638', 'text');

  return `${server}/is/image/${bg}?${layers.join('&')}&layer=comp&wid=500&hei=667&fmt=png&qlt=95`;
}

const RECIPES = { 'trp-offer': trpOffer };

export default function recipeURL(name, server, params) {
  const recipe = RECIPES[(name || '').trim().toLowerCase()];
  return recipe ? recipe(server.replace(/\/+$/, ''), params) : '';
}
