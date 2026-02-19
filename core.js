// Logic ported from pyspeedbinb/decryptor.py

const SpeedBinB = {};

SpeedBinB.toInt32 = function(n) {
    return n | 0;
};

SpeedBinB.unsignedRightShift = function(n, count) {
    return n >>> count;
};

SpeedBinB.decryptKeyTable = function(cid, initialKey, encryptedTableStr) {
    // w.Reader.jt(t, i, n)
    const rStr = cid + ":" + initialKey;
    let e = 0;

    // 1. Initial Hash
    for (let s = 0; s < rStr.length; s++) {
        const charCode = rStr.charCodeAt(s);
        e = SpeedBinB.toInt32(e + (charCode << (s % 16)));
    }

    e = e & 0x7FFFFFFF;
    if (e === 0) {
        e = 305419896;
    }

    // 2. Decrypt Loop
    let hChars = [];
    let u = e;
    const XOR_CONST = 1210056708; // 0x482E2D3C

    for (let s = 0; s < encryptedTableStr.length; s++) {
        const uShift = SpeedBinB.unsignedRightShift(u, 1);
        const uLsb = u & 1;
        const negULsb = -uLsb;
        const maskVal = XOR_CONST & negULsb;
        
        u = uShift ^ maskVal;
        u = SpeedBinB.toInt32(u);

        const nCharCode = encryptedTableStr.charCodeAt(s);
        const tempVal = nCharCode - 32 + u;
        const oVal = ((tempVal % 94) + 94) % 94 + 32;

        hChars.push(String.fromCharCode(oVal));
    }

    const hStr = hChars.join("");
    try {
        return JSON.parse(hStr);
    } catch (err) {
        console.error("JSON Parse Error", err);
        return null;
    }
};

SpeedBinB.deriveImageKey = function(imageUrl, ptbl, ctbl) {
    // w.Reader.prototype.mt(t)
    const i = [0, 0];
    
    if (imageUrl) {
        const n = imageUrl.lastIndexOf("/") + 1;
        const filenamePart = imageUrl.substring(n);
        const r = filenamePart.length;

        for (let e = 0; e < r; e++) {
            const charCode = filenamePart.charCodeAt(e);
            i[e % 2] += charCode;
        }

        i[0] %= 8;
        i[1] %= 8;
    }

    const keyS = ptbl[i[0]];
    const keyH = ctbl[i[1]];
    
    let scramblerType = "Unknown";
    if (keyH.startsWith("=") && keyS.startsWith("=")) {
        scramblerType = "Type2";
    } else if (!isNaN(parseInt(keyH)) && !isNaN(parseInt(keyS))) { 
        scramblerType = "Type1";
    } else if (keyH === "" && keyS === "") {
        scramblerType = "Type0";
    }

    return { keyS, keyH, scramblerType };
};

// Logic ported from pyspeedbinb/scrambler.py

SpeedBinB.Type1 = class {
    constructor(keyH, keyS) {
        this.Tt = this._parseKey(keyS);
        this.Pt = this._parseKey(keyH);
    }

    _parseKey(key) {
        const parts = key.split('-');
        if (parts.length !== 3) return null;

        const ndx = parseInt(parts[0]);
        const ndy = parseInt(parts[1]);
        const dataStr = parts[2];

        if (dataStr.length !== ndx * ndy * 2) return null;

        const decodeChar = (t) => {
            let i = 0;
            let n = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(t);
            if (n < 0) {
                n = "abcdefghijklmnopqrstuvwxyz".indexOf(t);
                i = 1;
            } else {
                i = 0;
            }
            return { i: i, val: i + 2 * n };
        };

        const pieces = [];
        for (let d = 0; d < ndx * ndy; d++) {
            const sDec = decodeChar(dataStr[2 * d]);
            const hDec = decodeChar(dataStr[2 * d + 1]);
            const s = sDec.val;
            const h = hDec.val;

            const a = (ndx - 1) * (ndy - 1) - 1;
            const f = ndx - 1 + a;
            const c = ndy - 1 + f;
            const l = 1 + c;

            let u = 0, o = 0;
            if (d <= a) { u = 2; o = 2; }
            else if (d <= f) { u = 2; o = 1; }
            else if (d <= c) { u = 1; o = 2; }
            else if (d <= l) { u = 1; o = 1; }

            pieces.push({ x: s, y: h, w: u, h: o });
        }
        return { ndx, ndy, piece: pieces };
    }

    calculateCoords(imageWidth, imageHeight) {
        const t = { width: imageWidth, height: imageHeight };
        const n = t.width - (t.width % 8);
        const r = Math.floor((n - 1) / 7) - (Math.floor((n - 1) / 7) % 8);
        const e = n - 7 * r;

        const s = t.height - (t.height % 8);
        const h = Math.floor((s - 1) / 7) - (Math.floor((s - 1) / 7) % 8);
        const u = s - 7 * h;

        const coords = [];
        const o = this.Tt.piece.length;

        for (let a = 0; a < o; a++) {
            const f = this.Tt.piece[a];
            const c = this.Pt.piece[a];

            const xsrc = Math.floor(f.x / 2) * r + (f.x % 2) * e;
            const ysrc = Math.floor(f.y / 2) * h + (f.y % 2) * u;
            const width = Math.floor(f.w / 2) * r + (f.w % 2) * e;
            const height = Math.floor(f.h / 2) * h + (f.h % 2) * u;

            const xdest = Math.floor(c.x / 2) * r + (c.x % 2) * e;
            const ydest = Math.floor(c.y / 2) * h + (c.y % 2) * u;

            coords.push({
                xsrc: xsrc, ysrc: ysrc, width: width, height: height,
                xdest: xdest, ydest: ydest
            });
        }

        const l = r * (this.Tt.ndx - 1) + e;
        const v = h * (this.Tt.ndy - 1) + u;

        if (l < t.width) {
            coords.push({ xsrc: l, ysrc: 0, width: t.width - l, height: v, xdest: l, ydest: 0 });
        }
        if (v < t.height) {
            coords.push({ xsrc: 0, ysrc: v, width: t.width, height: t.height - v, xdest: 0, ydest: v });
        }

        return coords;
    }
};

SpeedBinB.Type2 = class {
    constructor(keyH, keyS) {
        this.Jt = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1];
        
        this._parseKeys(keyS, keyH);
    }

    _decodeChar(charCode) {
        if (charCode >= 0 && charCode < this.Jt.length) {
            return this.Jt[charCode];
        }
        return -1;
    }

    _parseSubKey(dataStr) {
        const tList = [], nList = [], pList = [];
        
        for (let i = 0; i < this.T; i++) {
            tList.push(this._decodeChar(dataStr.charCodeAt(i)));
        }
        for (let i = 0; i < this.j; i++) {
            nList.push(this._decodeChar(dataStr.charCodeAt(this.T + i)));
        }
        for (let i = 0; i < this.T * this.j; i++) {
            pList.push(this._decodeChar(dataStr.charCodeAt(this.T + this.j + i)));
        }
        return { t: tList, n: nList, p: pList };
    }

    _parseKeys(keyS, keyH) {
        const sMatch = keyS.match(/^=([0-9]+)-([0-9]+)([-+])([0-9]+)-([-_0-9A-Za-z]+)$/);
        const hMatch = keyH.match(/^=([0-9]+)-([0-9]+)([-+])([0-9]+)-([-_0-9A-Za-z]+)$/);

        if (!sMatch || !hMatch) return;

        this.T = parseInt(sMatch[1]);
        this.j = parseInt(sMatch[2]);
        this.Dt = parseInt(sMatch[4]);
        
        const sDataStr = sMatch[5];
        const hDataStr = hMatch[5];

        const sParsed = this._parseSubKey(sDataStr);
        const hParsed = this._parseSubKey(hDataStr);

        this.Rt = sParsed.n;
        this.Ft = sParsed.t;
        this.Lt = hParsed.n;
        this.Nt = hParsed.t;

        this.kt = [];
        for (let u = 0; u < this.T * this.j; u++) {
            const finalIndex = sParsed.p[hParsed.p[u]];
            this.kt.push(finalIndex);
        }
    }

    calculateCoords(imageWidth, imageHeight) {
        if (!this.kt) {
             return [{ xsrc: 0, ysrc: 0, width: imageWidth, height: imageHeight, xdest: 0, ydest: 0 }];
        }

        const t = { width: imageWidth, height: imageHeight };
        const i = t.width - 2 * this.T * this.Dt;
        const n = t.height - 2 * this.j * this.Dt;

        const r = Math.floor((i + this.T - 1) / this.T);
        const e = i - (this.T - 1) * r;
        const s = Math.floor((n + this.j - 1) / this.j);
        const h = n - (this.j - 1) * s;

        const u = [];
        for (let o = 0; o < this.T * this.j; o++) {
            const a = o % this.T;
            const f = Math.floor(o / this.T);

            const c = this.Dt + a * (r + 2 * this.Dt) + (this.Lt[f] < a ? e - r : 0);
            const l = this.Dt + f * (s + 2 * this.Dt) + (this.Nt[a] < f ? h - s : 0);

            const v = this.kt[o] % this.T;
            const d = Math.floor(this.kt[o] / this.T);

            const b = v * r + (this.Rt[d] < v ? e - r : 0);
            const g = d * s + (this.Ft[v] < d ? h - s : 0);

            const p = this.Lt[f] === a ? e : r;
            const m = this.Nt[a] === f ? h : s;

            if (i > 0 && n > 0) {
                u.push({ xsrc: c, ysrc: l, width: p, height: m, xdest: b, ydest: g });
            }
        }
        return u;
    }
};

if (typeof window !== 'undefined') {
    window.SpeedBinB = SpeedBinB;
}
