# Cifra un vídeo en trozos AES-GCM. Uso: python3 tools_cifrar.py entrada.mp4 carpeta_salida clave_base64
import sys, os, base64, json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
src, out, key = sys.argv[1], sys.argv[2], base64.b64decode(sys.argv[3])
os.makedirs(out, exist_ok=True); g = AESGCM(key); CH = 8*1024*1024; n = 0
with open(src, 'rb') as f:
    while True:
        b = f.read(CH)
        if not b: break
        iv = os.urandom(12)
        open(os.path.join(out, f'{n:03d}.bin'), 'wb').write(iv + g.encrypt(iv, b, None)); n += 1
json.dump({'partes': n, 'tipo': 'video/mp4', 'bytes': os.path.getsize(src)}, open(os.path.join(out, 'info.json'), 'w'))
print(n, 'partes')
