"""Author-only independent decoding of the real rendered wallet receive QR."""
import sys
from pathlib import Path
from PIL import Image
import zxingcpp

image = Path(sys.argv[1])
result = zxingcpp.read_barcode(Image.open(image))
assert result and result.text == "1H7QvaYveeG4oBM7krKSpEMXwREv1RFjvK", "Receive QR decoded to the wrong address"
print("Rendered receive QR independently decoded to the exact public fixture address")
