import os
from PIL import Image, ImageDraw, ImageFilter

def create_launchgate_icon():
    os.makedirs('assets', exist_ok=True)
    size = 512
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Subtle Outer Glow
    glow_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_draw.rounded_rectangle([32, 32, size - 32, size - 32], radius=110, fill=(99, 102, 241, 70))
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(24))
    img.paste(glow_img, (0, 0), glow_img)

    # 2. Main Dark Squircle Background
    # Draw dark metallic rounded background with subtle border
    bg_box = [40, 40, size - 40, size - 40]
    draw.rounded_rectangle(bg_box, radius=100, fill=(13, 17, 28, 255), outline=(99, 102, 241, 230), width=6)
    
    # Inner border / highlight line
    inner_box = [46, 46, size - 46, size - 46]
    draw.rounded_rectangle(inner_box, radius=94, outline=(30, 41, 59, 180), width=3)

    # 3. Security Shield Arc / Launch Gate Arch in background
    # Shield shape points:
    # Top edge: (150, 140) to (362, 140)
    # Right down: (375, 270)
    # Bottom point: (256, 415)
    # Left down: (137, 270)
    shield_glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shield_glow)
    shield_pts = [
        (150, 130),
        (256, 115),
        (362, 130),
        (380, 260),
        (256, 410),
        (132, 260)
    ]
    s_draw.polygon(shield_pts, fill=(30, 27, 75, 140), outline=(99, 102, 241, 160))
    shield_glow = shield_glow.filter(ImageFilter.GaussianBlur(6))
    img.paste(shield_glow, (0, 0), shield_glow)

    # Draw crisp shield outline
    draw.polygon(shield_pts, outline=(99, 102, 241, 220))

    # Inner checkmark / readiness accent in the shield
    draw.line([(190, 240), (230, 280), (325, 185)], fill=(56, 189, 248, 120), width=8)

    # 4. Rocket Thrust / Flames
    # Outer flame (Orange / Red)
    flame_outer = [
        (230, 340),
        (282, 340),
        (275, 415),
        (256, 448),
        (237, 415)
    ]
    draw.polygon(flame_outer, fill=(239, 68, 68, 240))
    
    # Mid flame (Amber / Gold)
    flame_mid = [
        (238, 340),
        (274, 340),
        (268, 400),
        (256, 425),
        (244, 400)
    ]
    draw.polygon(flame_mid, fill=(245, 158, 11, 255))

    # Inner flame core (White Hot Yellow)
    flame_core = [
        (246, 340),
        (266, 340),
        (260, 380),
        (256, 395),
        (252, 380)
    ]
    draw.polygon(flame_core, fill=(254, 240, 138, 255))

    # 5. Rocket Fins (Wings)
    # Left wing
    left_wing = [
        (220, 285),
        (170, 355),
        (205, 360),
        (224, 335)
    ]
    draw.polygon(left_wing, fill=(79, 70, 229, 255), outline=(129, 140, 248, 255))

    # Right wing
    right_wing = [
        (292, 285),
        (342, 355),
        (307, 360),
        (288, 335)
    ]
    draw.polygon(right_wing, fill=(67, 56, 202, 255), outline=(129, 140, 248, 255))

    # 6. Rocket Fuselage (Main Body)
    # Sleek curved aerodynamic rocket fuselage
    fuselage = [
        (256, 130), # Nose tip
        (278, 185),
        (286, 260),
        (284, 342),
        (228, 342),
        (226, 260),
        (234, 185)
    ]
    draw.polygon(fuselage, fill=(248, 250, 252, 255), outline=(203, 213, 225, 255))

    # Fuselage 3D shadow split (Right side slightly shaded)
    fuselage_shade = [
        (256, 130),
        (278, 185),
        (286, 260),
        (284, 342),
        (256, 342)
    ]
    draw.polygon(fuselage_shade, fill=(226, 232, 240, 140))

    # Fuselage nosecone accent (Cyan tip)
    nosecone = [
        (256, 130),
        (268, 162),
        (244, 162)
    ]
    draw.polygon(nosecone, fill=(56, 189, 248, 255))

    # Center fin / keel
    draw.polygon([(254, 290), (258, 290), (258, 345), (254, 345)], fill=(99, 102, 241, 255))

    # 7. Cockpit / Visor (Glass Cyan Glow)
    # Circular cockpit window with high-tech reflection
    window_center = (256, 222)
    window_radius = 22
    draw.ellipse([
        window_center[0] - window_radius,
        window_center[1] - window_radius,
        window_center[0] + window_radius,
        window_center[1] + window_radius
    ], fill=(14, 165, 233, 255), outline=(224, 242, 254, 255), width=3)
    
    # Window highlight glare
    draw.ellipse([
        window_center[0] - 14,
        window_center[1] - 14,
        window_center[0] - 4,
        window_center[1] - 4
    ], fill=(255, 255, 255, 220))

    # 8. Thrust nozzle base
    draw.polygon([(236, 342), (276, 342), (272, 350), (240, 350)], fill=(51, 65, 85, 255))

    # Save high-res PNG and multi-size ICO
    img.save('assets/launchgate.png')
    
    # Save Windows multi-resolution ICO
    icon_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save('assets/launchgate.ico', format='ICO', sizes=icon_sizes)
    print("SUCCESS: Generated assets/launchgate.ico and assets/launchgate.png")

if __name__ == '__main__':
    create_launchgate_icon()
