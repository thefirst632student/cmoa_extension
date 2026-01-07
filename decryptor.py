import json, math
from PIL import Image

def to_int32(n):
    return n & 0xFFFFFFFF

def unsigned_right_shift(n, count):
    return (n % 0x100000000) >> count

def decrypt_key_table(cid: str, initial_key: str, encrypted_table_str: str):
    """
     w.Reader.jt(t, i, n)
    """
    r_str = cid + ":" + initial_key
    e = 0
    
    # 1. 混合输入，生成初始哈希值 e
    for s in range(len(r_str)):
        char_code = ord(r_str[s])
        # JS 中的移位操作是 32 位带符号整数操作
        e = to_int32(e + (char_code << (s % 16)))
    
    # 保证 e 在 32 位带符号整数范围内，并保证非零
    # e &= 2147483647 相当于取绝对值，但只取 31 位
    e = e & 0x7FFFFFFF
    if e == 0:
        e = 305419896
        
    # 2. 核心解密/混淆循环
    h_chars = []
    u = e
    
    # 1210056708 = 0x482E2D3C
    XOR_CONST = 1210056708 
    
    for s in range(len(encrypted_table_str)):
        # LCG (Linear Congruential Generator) 风格的混淆器
        # u = u >>> 1 ^ 1210056708 & -(1 & u);
        
        # 1. u >>> 1 (无符号右移)
        u_shift = unsigned_right_shift(u, 1)
        
        # 2. 1 & u (取最低位)
        u_lsb = u & 1
        
        # 3. -(1 & u) (如果最低位是1，则为-1，否则为0)
        neg_u_lsb = -u_lsb
        
        # 4. 1210056708 & -(1 & u)
        # 只有在 u 为奇数时，结果才是 1210056708
        mask_val = XOR_CONST & neg_u_lsb
        
        # 5. 更新 u
        u = u_shift ^ mask_val
        u = to_int32(u) # 确保 u 保持 32 位
        
        # 解密：o = (n.charCodeAt(s) - 32 + u) % 94 + 32;
        # Python 的 % 运算符结果的符号取决于左操作数，这里需要确保行为与 JS 一致
        n_char_code = ord(encrypted_table_str[s])
        
        temp_val = n_char_code - 32 + u
        o_val = (temp_val % 94 + 94) % 94 + 32 # 确保正数取模
        
        h_chars.append(chr(o_val))

    h_str = "".join(h_chars)
    
    # 3. 尝试解析 JSON
    try:
        return json.loads(h_str)
    except Exception:
        return None

def derive_image_key(image_url: str, ptbl: list, ctbl: list):
    """
    精确翻译 JS 的 w.Reader.prototype.mt(t) 密钥派生函数。
    
    :param image_url: 完整的图片请求 URL 或文件名
    :param ptbl: 已解密的 ptbl 密钥列表
    :param ctbl: 已解密的 ctbl 密钥列表
    :return: (key_s, key_h, scrambler_type)
    """
    i = [0, 0] # [index_s, index_h]
    
    if image_url:
        # 1. 提取文件名部分
        n = image_url.rfind("/") + 1
        filename_part = image_url[n:]
        r = len(filename_part)
        
        # 2. 累加字符码
        for e in range(r):
            char_code = ord(filename_part[e])
            # 偶数索引累加到 i[0]，奇数索引累加到 i[1]
            i[e % 2] += char_code
            
        # 3. 对 8 取模得到索引
        index_s = i[0] % 8
        index_h = i[1] % 8
    else:
        index_s = 0
        index_h = 0
        
    # 4. 从密钥表中取出密钥
    # 假设 ptbl 和 ctbl 长度至少为 8
    key_s = ptbl[index_s]
    key_h = ctbl[index_h]

    # 5. 判断 Scrambler 类型
    if key_h.startswith("=") and key_s.startswith("="):
        scrambler_type = "Type2" # 对应 JS 的 f 类
    elif key_h.isdigit() and key_s.isdigit():
        scrambler_type = "Type1" # 对应 JS 的 a 类
    elif key_h == "" and key_s == "":
        scrambler_type = "Type0" # 对应 JS 的 u 类 (无解密)
    else:
        scrambler_type = "Unknown"

    return key_s, key_h, scrambler_type

# 原始 JS 代码中的自定义字符集
CUSTOM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

import secrets

def generate_k_param(cid: str) -> tuple[str, str]:
    """
    模拟 JS 的 w.Reader.H(t) 函数来生成 k 参数。
    
    :param cid: Content ID (内容ID)
    :return: (k_param, fixed_random_string_n)
    """
    # 1. 生成随机字符串 n (使用固定值模拟)
    # 长度 16
    n = "".join(secrets.choice(CUSTOM_CHARS) for _ in range(16))
    
    # 2. 将 cid 重复足够长，截取 16 字符的 r 和 e
    
    # 确保重复次数足够覆盖 16 个字符
    repeat_count = math.ceil(16 / len(cid)) + 1
    i_str = cid * repeat_count
    
    r = i_str[:16]  # cid 的前 16 字符（不足则重复填充）
    e = i_str[-16:] # cid 的后 16 字符（不足则重复填充）

    # 3. 初始化三个 XOR 累加器 (s, h, u)
    # 注意：JS 的变量没有初始类型，这里初始化为 0
    s_acc = 0
    h_acc = 0
    u_acc = 0
    
    k_chars = []

    # 4. 循环生成 k，将 n 和 HASH_CHAR 穿插
    for index in range(16):
        # 取出 n, r, e 的第 index 个字符的 ASCII 码
        n_char_code = ord(n[index])
        r_char_code = ord(r[index])
        e_char_code = ord(e[index])
        
        # 累加并进行 XOR 运算
        # Python 的 XOR 运算符 (^) 已经是对整数的操作
        s_acc = to_int32(s_acc ^ n_char_code)
        h_acc = to_int32(h_acc ^ r_char_code)
        u_acc = to_int32(u_acc ^ e_char_code)
        
        # 计算 HASH_CHAR 的索引: [s + h + u & 63] (63 = 0x3F)
        # 索引是一个 32 位整数的和，但只取其低 6 位
        index_sum = s_acc + h_acc + u_acc
        char_index = index_sum & 63
        
        # 从自定义字符集中取出 HASH_CHAR
        hash_char = CUSTOM_CHARS[char_index]
        
        # 穿插：n[i] + HASH_CHAR[i]
        k_chars.append(n[index]) # n 的第 i 个字符 (随机串部分)
        k_chars.append(hash_char)  # 哈希计算得到的字符 (哈希部分)

    k_param = "".join(k_chars)
    
    # 返回生成的 k 参数和我们使用的随机串 n
    return k_param, n

def ptimg_descrambling(ptimg_json: dict | str, images: dict[str, Image.Image]) -> Image.Image:
    '''
    适用于采用ptimg.json方式获取混淆分片数据的网站
    根据ptimg.json对图像去混淆

    :param ptimg_json: *.ptimg.json，完成了JSON解析的词典/原始JSON字符串
    :param images: 对应的{"文件名": Pillow Image}
    :return: [Pillow Image, ...]
    '''
    if isinstance(ptimg_json, str):
        ptimg_json: dict = json.loads(ptimg_json)

    recover_imgs: list[Image.Image] = []
    for view in ptimg_json['views']:
        recover_img = Image.new(next(iter(images.values())).mode, (view['width'], view['height']))
        # i:4,4+142,202>568,404
        for coord in view['coords']:
            resource, coord = coord.split(':')

            src, coord = coord.split('+')
            xsrc, ysrc = src.split(',')

            size, dest = coord.split('>')
            width, height = size.split(',')
            xdest, ydest = dest.split(',')

            try:
                source_box = (
                    int(xsrc), int(ysrc),
                    int(xsrc) + int(width), 
                    int(ysrc) + int(height)
                )
                cropped_block = images[ptimg_json['resources'][resource]['src']].crop(source_box)

                recover_img.paste(cropped_block, (int(xdest), int(ydest)))
            except Exception as e:
                print(f"Pillow Paste/Crop Error for block: {coord}. Error: {e}")

        recover_imgs.append(recover_img)

    return recover_imgs

if __name__ == "__main__":
    import httpx, datetime, hashlib, io
    from rich.console import Console
    from bs4 import BeautifulSoup as bs

    client = httpx.Client(
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0"
        }
    )

    # EXAMPLE OF kirapo.jp, simple ptimg descrambing
    KIRAPO_EXAMPLE_URL = "https://kirapo.jp/pt/meteor/mahogal/2021385/"

    if not KIRAPO_EXAMPLE_URL.endswith('/'): KIRAPO_EXAMPLE_URL += '/'
    html = client.get(KIRAPO_EXAMPLE_URL + 'viewer')

    soup = bs(html, "html.parser")
    content = soup.find('div', {'id': 'content'})
    for pt in content.find_all('div'):
        # This URL join method is only for example
        # You should use better methods for product environment
        ptpath = KIRAPO_EXAMPLE_URL + pt['data-ptimg']
        ptjson = client.get(ptpath).json()
        images = {
            r['src']: Image.open(client.get('/'.join(ptpath.split('/')[:-1]) + '/' + r['src']))
            for r in ptjson['resources'].values()
        }
        recover_imgs: list[Image.Image] = ptimg_descrambling(ptjson, images)

    # EXAMPLE OF yanmaga.jp, complex bibGetCntntInfo stbl/ttbl/ptbl/ctbl descrambing
    CID_EXAMPLE = "06A0000000000263550B"

    k_result, n_used = generate_k_param(CID_EXAMPLE)

    from . import scrambler

    console = Console()

    res = client.get(
        "https://yanmaga.jp/viewer/bibGetCntntInfo",
        params={
            "cid": CID_EXAMPLE,
            "k": k_result,
            "dmytime": int(datetime.datetime.now().timestamp() * 1000),
            "random_identification": hashlib.md5(n_used.encode()).hexdigest(),
            "type": "comics"
        }
    )
    res.raise_for_status()
    
    resJson = res.json()
    console.print(resJson)

    resItems = resJson["items"]

    for item in resItems:
        ContentID = item["ContentID"]
        ContentsServer = item["ContentsServer"]
        Title = item["Title"]
        ParentTitle = item["ParentTitle"]
        ParentDescription = item["ParentDescription"]

        stbl = decrypt_key_table(ContentID, k_result, item['stbl'])
        ttbl = decrypt_key_table(ContentID, k_result, item['ttbl'])
        ptbl = decrypt_key_table(ContentID, k_result, item['ptbl'])
        ctbl = decrypt_key_table(ContentID, k_result, item['ctbl'])

        contentRes = client.get(
            f"{ContentsServer}/content"
        )
        contentRes.raise_for_status()

        contentJson = contentRes.json()

        soup = bs(contentJson['ttx'], "html.parser")
        for img in soup.find_all("t-img"):
            img_url = img["src"]
            org_width = int(img["orgwidth"])
            org_height = int(img["orgheight"])

            imgRes = client.get(
                f"{ContentsServer}/img/{img_url}",
                params={"q": 1}
            )
            imgRes.raise_for_status()

            raw_img_io = io.BytesIO(imgRes.content)
            raw_img: Image.Image = Image.open(raw_img_io)

            width, height = raw_img.size

            key_s, key_h, scrambler_type = derive_image_key(img_url, ptbl, ctbl)
            console.print(key_s, key_h, scrambler_type)
            if scrambler_type == "Type1":
                coords = scrambler.Type1(key_s, key_h).calculate_coords(width, height)
            elif scrambler_type == "Type2":
                coords = scrambler.Type2(key_s, key_h).calculate_coords(width, height)
            else:
                coords = [{
                    'xsrc': 0, 'ysrc': 0, 'width': width, 'height': height,
                    'xdest': 0, 'ydest': 0
                }]
            console.print(coords)

            recover_img = Image.new(raw_img.mode, (org_width, org_height)) # 创建新的画布

            for coord in coords:
                try:
                    # Pillow 的 crop 接受 (left, upper, right, lower)
                    source_box = (
                        coord['xsrc'], 
                        coord['ysrc'], 
                        coord['xsrc'] + coord['width'], 
                        coord['ysrc'] + coord['height']
                    )
                    cropped_block = raw_img.crop(source_box)

                    # Pillow 的 paste 接受 (left, upper)
                    recover_img.paste(cropped_block, (coord['xdest'], coord['ydest']))
                except Exception as e:
                    print(f"Pillow Paste/Crop Error for block: {coord}. Error: {e}")

            recover_img.show()
            break

        break