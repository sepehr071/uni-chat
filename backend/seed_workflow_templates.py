"""
Seed script for workflow templates.
Run: cd backend && python seed_workflow_templates.py
"""
from pymongo import MongoClient
from datetime import datetime

# MongoDB connection
client = MongoClient('mongodb://localhost:27017/')
db = client['unichat']
workflows_collection = db['workflows']

# Clear existing templates
workflows_collection.delete_many({'is_template': True})
print("Cleared existing workflow templates")

WORKFLOW_TEMPLATES = [
    # 1. Product Photography Studio
    {
        'name': 'Product Photography Studio',
        'description': 'Professional e-commerce product shot on clean white background with studio lighting',
        'nodes': [
            {
                'id': 'upload-product-1',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-studio-1',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 150},
                'data': {
                    'label': 'Studio Shot',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Professional product photography of the uploaded item, pure white seamless background, soft studio lighting from multiple angles, high-end commercial quality, sharp focus on product details, centered composition, 8K resolution, photorealistic, advertising quality',
                    'negativePrompt': 'harsh shadows, reflections, colored background, blur, watermark, text, logos, hands, people, cluttered',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-upload-studio',
                'source': 'upload-product-1',
                'target': 'gen-studio-1',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 2. Lifestyle Scene Generator
    {
        'name': 'Lifestyle Scene Generator',
        'description': 'Generate your product in 3 different real-world contexts: kitchen, office, and outdoor cafe',
        'nodes': [
            {
                'id': 'upload-product-2',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 300},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-kitchen-2',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 0},
                'data': {
                    'label': 'Kitchen Scene',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product placed elegantly in a modern minimalist Scandinavian kitchen, natural morning light streaming through large window, white marble countertop, lifestyle photography, warm inviting tones, bokeh background, editorial style, magazine cover quality',
                    'negativePrompt': 'cluttered, dark, low quality, artificial lighting, stock photo feel, people, hands',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-office-2',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 300},
                'data': {
                    'label': 'Office Scene',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product on a sleek modern office desk, professional workspace environment, MacBook laptop nearby, green plants, natural daylight from window, clean minimalist aesthetic, productivity lifestyle, premium quality photography',
                    'negativePrompt': 'cluttered desk, messy, dark, low quality, artificial, stock photo feel, people',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-cafe-2',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 600},
                'data': {
                    'label': 'Outdoor Cafe Scene',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product in outdoor European cafe setting, rustic wooden table, beautifully blurred background with greenery and flowers, golden hour warm lighting, lifestyle shot, cozy atmosphere, Instagram worthy, travel aesthetic',
                    'negativePrompt': 'cluttered, dark, low quality, artificial, stock photo feel, indoor, people, hands',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-kitchen',
                'source': 'upload-product-2',
                'target': 'gen-kitchen-2',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-office',
                'source': 'upload-product-2',
                'target': 'gen-office-2',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-cafe',
                'source': 'upload-product-2',
                'target': 'gen-cafe-2',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 3. Social Media Content Pack
    {
        'name': 'Social Media Content Pack',
        'description': 'Generate product shots optimized for Instagram, Stories, and Website banners',
        'nodes': [
            {
                'id': 'upload-product-3',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 300},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-instagram-3',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 0},
                'data': {
                    'label': 'Instagram Square',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Eye-catching product shot for Instagram feed, vibrant saturated colors, clean soft gradient background in pastel tones, modern aesthetic, perfect square composition 1:1 ratio, trending style, high engagement visual, professional product photography',
                    'negativePrompt': 'dull colors, cluttered, text, watermark, blurry, low quality',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-story-3',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 300},
                'data': {
                    'label': 'Story/Reel Format',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Vertical product showcase for Instagram Stories and TikTok, dynamic interesting angle, bold vibrant colors, ample negative space at top and bottom for text overlay, social media ready, Gen-Z aesthetic, trendy, 9:16 vertical composition',
                    'negativePrompt': 'horizontal, cluttered, no space for text, boring angle, dull',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-banner-3',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 600},
                'data': {
                    'label': 'Website Banner',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Wide horizontal product banner for website hero section, product positioned on left third with clean negative space on right for headline text, professional marketing material, clean modern design, subtle gradient background, panoramic 3:1 ratio',
                    'negativePrompt': 'centered product, no space for text, cluttered, vertical, busy background',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-instagram',
                'source': 'upload-product-3',
                'target': 'gen-instagram-3',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-story',
                'source': 'upload-product-3',
                'target': 'gen-story-3',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-banner',
                'source': 'upload-product-3',
                'target': 'gen-banner-3',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 4. Seasonal Campaign Creator
    {
        'name': 'Seasonal Campaign Creator',
        'description': 'Generate holiday-themed and summer-themed product shots for seasonal marketing',
        'nodes': [
            {
                'id': 'upload-product-4',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-holiday-4',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 0},
                'data': {
                    'label': 'Holiday Theme',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product in festive Christmas holiday setting, elegant gift presentation, warm cozy fireplace lighting, pine branches and holly decorations, gold and deep red accents, twinkling fairy lights bokeh, gift-worthy luxurious presentation, seasonal marketing, winter wonderland feel',
                    'negativePrompt': 'dark gloomy, cluttered, summer elements, beach, cheap looking, low quality',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-summer-4',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 300},
                'data': {
                    'label': 'Summer Vibes',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product in bright tropical summer setting, beach vacation vibes, palm leaves and monstera plants, bright sunshine with lens flare, fresh vibrant colors, turquoise and coral accents, vacation mood, poolside aesthetic, refreshing summer marketing campaign',
                    'negativePrompt': 'dark, gloomy, winter, snow, Christmas, cold colors, indoor, low quality',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-holiday',
                'source': 'upload-product-4',
                'target': 'gen-holiday-4',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-summer',
                'source': 'upload-product-4',
                'target': 'gen-summer-4',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 5. Brand Style Transfer
    {
        'name': 'Brand Style Transfer',
        'description': 'Apply a reference image style to your product for consistent brand aesthetic',
        'nodes': [
            {
                'id': 'upload-style-5',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 0},
                'data': {
                    'label': 'Upload Style Reference',
                    'imageUrl': None
                }
            },
            {
                'id': 'upload-product-5',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 220},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-styled-5',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 100},
                'data': {
                    'label': 'Styled Product',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photo beautifully styled to match the aesthetic, color palette, lighting mood, and visual style of the reference image, maintaining perfect brand consistency, professional quality, cohesive visual identity, same photographic style and tone',
                    'negativePrompt': 'inconsistent style, clashing colors, generic look, different mood, mismatched aesthetic',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-style-ref',
                'source': 'upload-style-5',
                'target': 'gen-styled-5',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-product-styled',
                'source': 'upload-product-5',
                'target': 'gen-styled-5',
                'sourceHandle': 'output',
                'targetHandle': 'input-1'
            }
        ]
    },

    # 6. Before/After Enhancement
    {
        'name': 'Photo Enhancement',
        'description': 'Transform a basic product photo into professional commercial-quality imagery',
        'nodes': [
            {
                'id': 'upload-basic-6',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Basic Photo',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-enhanced-6',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 150},
                'data': {
                    'label': 'Enhanced Professional',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Transform into stunning professional product photography, perfect studio lighting setup, clean pure background, remove all imperfections and distractions, commercial advertising quality, high-end retouching, magazine-worthy, color corrected, sharp details, premium look',
                    'negativePrompt': 'original flaws, poor lighting, amateur look, blur, noise, artifacts, cluttered background, shadows',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-enhance',
                'source': 'upload-basic-6',
                'target': 'gen-enhanced-6',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 7. Advertisement Creator
    {
        'name': 'Advertisement Creator',
        'description': 'Generate A/B test ad variations: minimalist Apple-style vs bold energetic design',
        'nodes': [
            {
                'id': 'upload-product-7',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-minimal-7',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 0},
                'data': {
                    'label': 'Minimalist Ad',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Minimalist luxury advertisement, product elegantly floating on clean soft gray gradient background, subtle natural shadow beneath, premium Apple-style aesthetic, lots of white space, sophisticated understated elegance, high-end brand feel, clean typography ready',
                    'negativePrompt': 'busy, cluttered, colorful, loud, cheap looking, harsh shadows, text',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-bold-7',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 300},
                'data': {
                    'label': 'Bold Energetic Ad',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Bold dynamic advertisement design, product with vibrant colorful gradient background in electric blue and hot pink, energetic diagonal composition, motion blur accents, attention-grabbing eye-catching, modern Gen-Z marketing visual, sale promotion ready, high impact',
                    'negativePrompt': 'boring, static, muted colors, plain white, minimal, subtle, corporate boring',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-minimal',
                'source': 'upload-product-7',
                'target': 'gen-minimal-7',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-bold',
                'source': 'upload-product-7',
                'target': 'gen-bold-7',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 8. Character Variation Generator
    {
        'name': 'Character Variation Generator',
        'description': 'Create different poses and expressions for your character or mascot design',
        'nodes': [
            {
                'id': 'upload-character-8',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Character/Mascot',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-action-8',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 0},
                'data': {
                    'label': 'Action Pose',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Same character in dynamic action pose, running or jumping with movement and energy, exactly consistent style colors and design as reference, character design sheet style, full body visible, clean white background, mascot illustration, maintaining all character features',
                    'negativePrompt': 'different character, wrong colors, inconsistent style, static boring pose, cropped',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-happy-8',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 300},
                'data': {
                    'label': 'Happy Expression',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Same character with joyful happy excited expression, big smile, sparkling eyes, celebratory pose with arms up, exactly consistent design style and colors as reference, expressive face, mascot style, clean white background, maintaining all character features',
                    'negativePrompt': 'different character, wrong colors, inconsistent style, sad, neutral, angry',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-action',
                'source': 'upload-character-8',
                'target': 'gen-action-8',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-happy',
                'source': 'upload-character-8',
                'target': 'gen-happy-8',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 9. Character Turnaround Reference Sheet (Multi-angle fan-out)
    {
        'name': 'Character Turnaround Reference Sheet',
        'description': 'Generate consistent multi-angle character views for game dev, animation, and 3D modeling reference sheets',
        'nodes': [
            {
                'id': 'upload-character-9',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 300},
                'data': {
                    'label': 'Upload Character Design',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-front-9',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 0},
                'data': {
                    'label': 'Front View (0°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Character turnaround sheet, FRONT VIEW facing camera directly, full body visible head to toe, T-pose or neutral standing pose, exactly matching the reference character design colors style and proportions, clean white background, character design reference sheet style, consistent lighting from front, professional concept art quality, game development asset',
                    'negativePrompt': 'different character, wrong colors, side view, back view, cropped, partial body, different style, inconsistent design',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-side-9',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 200},
                'data': {
                    'label': 'Side View (90°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Character turnaround sheet, SIDE VIEW profile facing right, full body visible head to toe, neutral standing pose, exactly matching the reference character design colors style and proportions, clean white background, character design reference sheet style, consistent lighting, professional concept art quality, game development asset, perfect profile silhouette',
                    'negativePrompt': 'different character, wrong colors, front view, back view, cropped, partial body, different style, facing left, 3/4 angle',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-back-9',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 400},
                'data': {
                    'label': 'Back View (180°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Character turnaround sheet, BACK VIEW from behind, full body visible head to toe, neutral standing pose, exactly matching the reference character design colors style and proportions, clean white background, character design reference sheet style, showing back details of costume and hair, professional concept art quality, game development asset',
                    'negativePrompt': 'different character, wrong colors, front view, side view, cropped, partial body, different style, face visible',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-threequarter-9',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 600},
                'data': {
                    'label': '3/4 View (45°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Character turnaround sheet, THREE-QUARTER VIEW at 45 degree angle, full body visible head to toe, dynamic but readable pose, exactly matching the reference character design colors style and proportions, clean white background, character design reference sheet style, showing depth and dimension, professional concept art quality, game development asset',
                    'negativePrompt': 'different character, wrong colors, front view, side view, back view, cropped, partial body, different style',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-front-9',
                'source': 'upload-character-9',
                'target': 'gen-front-9',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-side-9',
                'source': 'upload-character-9',
                'target': 'gen-side-9',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-back-9',
                'source': 'upload-character-9',
                'target': 'gen-back-9',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-threequarter-9',
                'source': 'upload-character-9',
                'target': 'gen-threequarter-9',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 10. Two-Pass Enhancement Pipeline (Sequential chain)
    {
        'name': 'Two-Pass Enhancement Pipeline',
        'description': 'Progressive 3-stage refinement: background cleanup → lighting correction → final polish. Professional multi-pass workflow.',
        'nodes': [
            {
                'id': 'upload-raw-10',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Raw Photo',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-pass1-10',
                'type': 'imageGen',
                'position': {'x': 350, 'y': 150},
                'data': {
                    'label': 'Pass 1: Background Cleanup',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Clean up the background of this product photo, remove all distracting elements and clutter, replace with clean neutral gradient background, keep the product exactly as is with all details preserved, professional product photography background isolation, seamless edge blending',
                    'negativePrompt': 'change product, alter product colors, blur product, crop product, different product angle',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-pass2-10',
                'type': 'imageGen',
                'position': {'x': 650, 'y': 150},
                'data': {
                    'label': 'Pass 2: Lighting Correction',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Enhance the lighting of this product photo, add professional studio lighting setup with soft key light and fill light, remove harsh shadows, add subtle rim lighting for product separation, correct color temperature to neutral daylight, maintain all product details and colors exactly',
                    'negativePrompt': 'change product, alter product design, harsh shadows, overexposed, underexposed, color cast',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-pass3-10',
                'type': 'imageGen',
                'position': {'x': 950, 'y': 150},
                'data': {
                    'label': 'Pass 3: Final Polish',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Final professional polish pass, enhance sharpness and micro-details, add subtle reflection on surface beneath product, perfect color grading for commercial use, magazine-quality final result, 8K ultra sharp details, advertising campaign ready, high-end retouching finish',
                    'negativePrompt': 'blur, noise, artifacts, over-sharpened, unnatural colors, plastic look',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-pass1-10',
                'source': 'upload-raw-10',
                'target': 'gen-pass1-10',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-pass2-10',
                'source': 'gen-pass1-10',
                'target': 'gen-pass2-10',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-pass3-10',
                'source': 'gen-pass2-10',
                'target': 'gen-pass3-10',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 11. Multi-Product Composite Scene (3-input fan-in)
    {
        'name': 'Multi-Product Composite Scene',
        'description': 'Combine multiple products with a style reference into one cohesive lifestyle scene. Uses all 3 input slots.',
        'nodes': [
            {
                'id': 'upload-product-a-11',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 0},
                'data': {
                    'label': 'Upload Product A (Main)',
                    'imageUrl': None
                }
            },
            {
                'id': 'upload-product-b-11',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 200},
                'data': {
                    'label': 'Upload Product B (Secondary)',
                    'imageUrl': None
                }
            },
            {
                'id': 'upload-style-11',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 400},
                'data': {
                    'label': 'Upload Scene Style Reference',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-composite-11',
                'type': 'imageGen',
                'position': {'x': 450, 'y': 180},
                'data': {
                    'label': 'Composite Lifestyle Scene',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Create a beautiful lifestyle scene combining both products naturally, Product A as the main focus in foreground, Product B as complementary element, match the aesthetic mood lighting and style of the reference image exactly, cohesive color palette, professional product photography, natural arrangement that tells a story, editorial quality composition',
                    'negativePrompt': 'products floating, unnatural placement, mismatched styles, cluttered, cheap looking, inconsistent lighting between products',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-product-a-11',
                'source': 'upload-product-a-11',
                'target': 'gen-composite-11',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-product-b-11',
                'source': 'upload-product-b-11',
                'target': 'gen-composite-11',
                'sourceHandle': 'output',
                'targetHandle': 'input-1'
            },
            {
                'id': 'e-style-11',
                'source': 'upload-style-11',
                'target': 'gen-composite-11',
                'sourceHandle': 'output',
                'targetHandle': 'input-2'
            }
        ]
    },

    # 12. Brand Campaign Suite (Fan-in → Fan-out, most complex)
    {
        'name': 'Brand Campaign Suite',
        'description': 'Complete marketing campaign: style-match your product, then generate Hero Banner, Social Square, and Print Ad variants. Most complex template.',
        'nodes': [
            {
                'id': 'upload-product-12',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 100},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'upload-brand-12',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 320},
                'data': {
                    'label': 'Upload Brand Style Guide',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-styled-base-12',
                'type': 'imageGen',
                'position': {'x': 380, 'y': 200},
                'data': {
                    'label': 'Styled Base Image',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photography styled to perfectly match the brand aesthetic from the reference, consistent color palette, matching lighting mood and tone, brand-appropriate background treatment, professional commercial quality, cohesive visual identity, ready for campaign adaptation',
                    'negativePrompt': 'off-brand colors, inconsistent style, generic look, mismatched aesthetic, amateur quality',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-hero-12',
                'type': 'imageGen',
                'position': {'x': 750, 'y': 0},
                'data': {
                    'label': 'Hero Banner (16:9)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Wide cinematic hero banner composition, product positioned in left third with expansive negative space on right for headline text, dramatic brand-consistent lighting, premium advertising quality, website hero section ready, 16:9 widescreen aspect ratio, impactful visual hierarchy',
                    'negativePrompt': 'centered product, no text space, cluttered, vertical composition, busy background',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-social-12',
                'type': 'imageGen',
                'position': {'x': 750, 'y': 220},
                'data': {
                    'label': 'Social Square (1:1)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Instagram-optimized square composition 1:1 ratio, product as bold central focus, eye-catching scroll-stopping visual, vibrant brand colors, clean modern aesthetic, social media engagement optimized, trending visual style, shareable quality',
                    'negativePrompt': 'boring, dull colors, off-center awkwardly, text overlay, watermarks',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-print-12',
                'type': 'imageGen',
                'position': {'x': 750, 'y': 440},
                'data': {
                    'label': 'Print Ad (4:5)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Print advertisement layout 4:5 vertical ratio, product elegantly positioned in upper portion, generous space below for copy and call-to-action, magazine advertisement quality, CMYK-friendly colors, high resolution print-ready, sophisticated layout for premium publications',
                    'negativePrompt': 'no space for text, horizontal, web-only colors, low resolution feel, cluttered layout',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-product-12',
                'source': 'upload-product-12',
                'target': 'gen-styled-base-12',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-brand-12',
                'source': 'upload-brand-12',
                'target': 'gen-styled-base-12',
                'sourceHandle': 'output',
                'targetHandle': 'input-1'
            },
            {
                'id': 'e-hero-12',
                'source': 'gen-styled-base-12',
                'target': 'gen-hero-12',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-social-12',
                'source': 'gen-styled-base-12',
                'target': 'gen-social-12',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-print-12',
                'source': 'gen-styled-base-12',
                'target': 'gen-print-12',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 13. Product 360° Showcase (6-output extended fan-out)
    {
        'name': 'Product 360° Showcase',
        'description': 'Generate 6 different viewing angles for e-commerce 360° product display. Largest template with 7 nodes.',
        'nodes': [
            {
                'id': 'upload-product-13',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 450},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-0deg-13',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 0},
                'data': {
                    'label': 'Front (0°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photograph from FRONT VIEW 0 degrees, straight-on angle facing camera directly, clean white e-commerce background, consistent studio lighting, exactly matching reference product design and colors, professional 360 spin photography style, sharp focus on all details',
                    'negativePrompt': 'different product, wrong angle, side view, angled view, colored background, shadows',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-60deg-13',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 180},
                'data': {
                    'label': 'Front-Right (60°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photograph from FRONT-RIGHT VIEW 60 degrees rotation, showing front and right side, clean white e-commerce background, consistent studio lighting matching other angles, exactly matching reference product design and colors, professional 360 spin photography style',
                    'negativePrompt': 'different product, wrong angle, front view, back view, colored background',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-120deg-13',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 360},
                'data': {
                    'label': 'Back-Right (120°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photograph from BACK-RIGHT VIEW 120 degrees rotation, showing back and right side, clean white e-commerce background, consistent studio lighting matching other angles, exactly matching reference product design and colors, professional 360 spin photography style',
                    'negativePrompt': 'different product, wrong angle, front view, colored background',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-180deg-13',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 540},
                'data': {
                    'label': 'Back (180°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photograph from BACK VIEW 180 degrees, showing back of product directly, clean white e-commerce background, consistent studio lighting matching other angles, exactly matching reference product design and colors, professional 360 spin photography style, showing back details',
                    'negativePrompt': 'different product, wrong angle, front visible, colored background',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-240deg-13',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 720},
                'data': {
                    'label': 'Back-Left (240°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photograph from BACK-LEFT VIEW 240 degrees rotation, showing back and left side, clean white e-commerce background, consistent studio lighting matching other angles, exactly matching reference product design and colors, professional 360 spin photography style',
                    'negativePrompt': 'different product, wrong angle, front view, right side, colored background',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-300deg-13',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 900},
                'data': {
                    'label': 'Front-Left (300°)',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photograph from FRONT-LEFT VIEW 300 degrees rotation, showing front and left side, clean white e-commerce background, consistent studio lighting matching other angles, exactly matching reference product design and colors, professional 360 spin photography style',
                    'negativePrompt': 'different product, wrong angle, back view, right side, colored background',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-0deg-13',
                'source': 'upload-product-13',
                'target': 'gen-0deg-13',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-60deg-13',
                'source': 'upload-product-13',
                'target': 'gen-60deg-13',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-120deg-13',
                'source': 'upload-product-13',
                'target': 'gen-120deg-13',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-180deg-13',
                'source': 'upload-product-13',
                'target': 'gen-180deg-13',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-240deg-13',
                'source': 'upload-product-13',
                'target': 'gen-240deg-13',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-300deg-13',
                'source': 'upload-product-13',
                'target': 'gen-300deg-13',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 14. Concept Art Evolution (2-layer sequential)
    {
        'name': 'Concept Art Evolution',
        'description': 'Transform rough sketches into polished concept art through iterative refinement. Sketch → Render → Final Detail.',
        'nodes': [
            {
                'id': 'upload-sketch-14',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Rough Sketch',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-render-14',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 150},
                'data': {
                    'label': 'Initial Render',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Transform this rough sketch into a clean digital rendering, maintain the exact composition pose and design intent, add proper form and volume, establish base colors and values, clean linework, concept art style, professional digital painting foundation, keep all design elements from the sketch',
                    'negativePrompt': 'change design, different pose, different composition, lose sketch details, photorealistic',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-final-14',
                'type': 'imageGen',
                'position': {'x': 750, 'y': 150},
                'data': {
                    'label': 'Final Detailed Art',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Finalize this concept art with full professional detail, add rich textures materials and surface details, dramatic cinematic lighting with rim lights and atmospheric effects, color grade for visual impact, AAA game concept art quality, portfolio-ready illustration, maintain exact design from previous pass while adding polish and refinement',
                    'negativePrompt': 'change design, different character, lose details, flat lighting, amateur quality, different style',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-render-14',
                'source': 'upload-sketch-14',
                'target': 'gen-render-14',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-final-14',
                'source': 'gen-render-14',
                'target': 'gen-final-14',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    }
]

# Insert templates
for template in WORKFLOW_TEMPLATES:
    doc = {
        'user_id': None,  # System template - no owner
        'name': template['name'],
        'description': template['description'],
        'nodes': template['nodes'],
        'edges': template['edges'],
        'is_template': True,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }
    workflows_collection.insert_one(doc)
    print(f"Created template: {template['name']}")

print(f"\nSuccessfully created {len(WORKFLOW_TEMPLATES)} workflow templates!")
client.close()
