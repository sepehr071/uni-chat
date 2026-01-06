"""
Seed script to populate the database with professional AI image generation prompt templates
Based on 2026 research from leading sources
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.models.prompt_template import PromptTemplateModel

# Professional templates based on 2026 research
TEMPLATES = [
    # Category 1: Product Photography (E-Commerce)
    {
        'name': 'Clean White Background - Product Shot',
        'category': 'product_photography',
        'template_text': 'Clean product shot of {{product}} on pure white background (RGB 255,255,255), professional studio lighting, soft even illumination from 45-degree angle, subtle fill light, no harsh shadows, product fills 85% of frame, sharp focus, high resolution, clean minimalist aesthetic',
        'variables': ['product'],
        'description': 'Professional e-commerce product photo with clean white background'
    },
    {
        'name': 'Premium Product Photography',
        'category': 'product_photography',
        'template_text': 'High-end product photography of {{product}}, luxurious presentation, dramatic lighting with soft shadows, premium aesthetic, professional studio setup, detailed texture visible, elegant composition, commercial photography style, 4K quality',
        'variables': ['product'],
        'description': 'Luxury product shot with premium feel'
    },
    {
        'name': 'Product with Lifestyle Context',
        'category': 'product_photography',
        'template_text': 'Product photo of {{product}} in real-world setting, natural environment, authentic lifestyle context, warm natural lighting, professional composition, genuine atmosphere, aspirational yet relatable, high-quality photography',
        'variables': ['product'],
        'description': 'Product shown in context of use'
    },
    {
        'name': 'Detailed Close-Up Shot',
        'category': 'product_photography',
        'template_text': 'Extreme close-up of {{product}}, macro photography, intricate details visible, texture emphasis, professional lighting to highlight features, shallow depth of field, high resolution, product detail showcase',
        'variables': ['product'],
        'description': 'Macro shot highlighting product details'
    },

    # Category 2: Advertisement/Marketing
    {
        'name': 'Modern Advertisement',
        'category': 'advertisement',
        'template_text': 'Professional advertisement photo of {{subject}}, modern aesthetic, vibrant colors, dramatic lighting, clean background, commercial photography style, high-end marketing campaign look, eye-catching composition, 4K quality',
        'variables': ['subject'],
        'description': 'Modern, eye-catching advertisement photo'
    },
    {
        'name': 'Luxury Brand Campaign',
        'category': 'advertisement',
        'template_text': 'Luxury advertisement for {{brand_product}}, premium aesthetic, sophisticated composition, elegant lighting, high-end fashion photography style, aspirational mood, refined color palette, professional commercial photography',
        'variables': ['brand_product'],
        'description': 'High-end luxury brand advertising'
    },
    {
        'name': 'Dynamic Action Shot',
        'category': 'advertisement',
        'template_text': '{{subject}} in dynamic action, energetic composition, motion blur effect, vibrant colors, dramatic lighting, professional sports photography style, high impact visual, advertising campaign quality',
        'variables': ['subject'],
        'description': 'Energetic action-focused advertisement'
    },
    {
        'name': 'Minimalist Brand Ad',
        'category': 'advertisement',
        'template_text': 'Minimalist advertisement featuring {{product}}, clean simple composition, negative space, modern design, subtle colors, professional minimalist photography, brand-focused aesthetic, contemporary style',
        'variables': ['product'],
        'description': 'Clean, minimalist advertising approach'
    },

    # Category 3: Social Media Content
    {
        'name': 'Instagram-Optimized Post',
        'category': 'social_media',
        'template_text': 'Eye-catching Instagram post image for {{topic}}, 1:1 square composition, bold vibrant colors, engaging visual elements, modern design, professional yet approachable style, high engagement potential',
        'variables': ['topic'],
        'description': 'Square format optimized for Instagram'
    },
    {
        'name': 'LinkedIn Professional',
        'category': 'social_media',
        'template_text': 'Professional LinkedIn post image about {{topic}}, authoritative yet approachable, clean modern design, business-appropriate colors, professional photography style, corporate aesthetic, trustworthy feel',
        'variables': ['topic'],
        'description': 'Professional business-focused content'
    },
    {
        'name': 'Pinterest-Style Vertical',
        'category': 'social_media',
        'template_text': 'Vertical Pinterest-optimized image for {{topic}}, 2:3 aspect ratio, inspiring composition, beautiful aesthetics, aspirational feel, high quality photography, pin-worthy design',
        'variables': ['topic'],
        'description': 'Tall format for Pinterest'
    },
    {
        'name': 'Story/Reel Vertical',
        'category': 'social_media',
        'template_text': 'Vertical story image about {{topic}}, 9:16 format, mobile-optimized composition, bold text-friendly design, engaging visual, modern aesthetic, social media native feel',
        'variables': ['topic'],
        'description': 'Vertical format for Stories and Reels'
    },

    # Category 4: Lifestyle/Contextual
    {
        'name': 'Authentic Lifestyle Moment',
        'category': 'lifestyle',
        'template_text': 'Lifestyle photo showing {{subject}} in use, natural environment, authentic moment, warm natural lighting, genuine emotion, aspirational setting, professional photography, real-life context',
        'variables': ['subject'],
        'description': 'Natural, authentic lifestyle photography'
    },
    {
        'name': 'Home Interior Lifestyle',
        'category': 'lifestyle',
        'template_text': '{{subject}} in beautiful home interior, cozy atmosphere, natural window light, modern decor, lived-in feel, warm inviting ambiance, interior design photography style, aspirational yet attainable',
        'variables': ['subject'],
        'description': 'Home setting lifestyle shot'
    },
    {
        'name': 'Outdoor Lifestyle',
        'category': 'lifestyle',
        'template_text': '{{subject}} in outdoor natural setting, golden hour lighting, scenic background, candid moment, nature photography style, fresh outdoor atmosphere, authentic lifestyle',
        'variables': ['subject'],
        'description': 'Outdoor natural environment lifestyle'
    },
    {
        'name': 'Urban Lifestyle',
        'category': 'lifestyle',
        'template_text': '{{subject}} in modern urban environment, city background, contemporary lifestyle, natural street photography style, authentic urban moment, modern metropolitan feel',
        'variables': ['subject'],
        'description': 'Urban city lifestyle photography'
    },

    # Category 5: Hero/Banner Images
    {
        'name': 'Cinematic Hero Banner',
        'category': 'hero_banner',
        'template_text': 'Wide cinematic hero image for {{purpose}}, dramatic composition, professional lighting, high contrast, premium aesthetic, landscape orientation 16:9, ultra high quality, visually striking, banner-ready',
        'variables': ['purpose'],
        'description': 'Dramatic wide banner image'
    },
    {
        'name': 'Website Hero Section',
        'category': 'hero_banner',
        'template_text': 'Professional website hero image representing {{concept}}, modern web design aesthetic, clean composition, ample negative space for text overlay, professional photography, brand-friendly, high resolution 16:9',
        'variables': ['concept'],
        'description': 'Website header/hero section image'
    },
    {
        'name': 'Email Header Banner',
        'category': 'hero_banner',
        'template_text': 'Email newsletter header image for {{topic}}, wide format, attention-grabbing, professional design, brand cohesive, clear focal point, marketing email optimized',
        'variables': ['topic'],
        'description': 'Email campaign header image'
    },
    {
        'name': 'Landing Page Hero',
        'category': 'hero_banner',
        'template_text': 'Conversion-focused landing page hero image for {{product_service}}, clear value proposition visual, professional photography, trust-building aesthetic, high quality, attention-grabbing',
        'variables': ['product_service'],
        'description': 'Landing page conversion-focused hero'
    },

    # Category 6: Tech/SaaS Marketing
    {
        'name': 'SaaS Dashboard Visualization',
        'category': 'tech_saas',
        'template_text': 'Modern tech visualization representing {{concept}}, clean minimal design, gradient background in {{colors}}, 3D elements, futuristic aesthetic, professional B2B marketing style, digital innovation feel',
        'variables': ['concept', 'colors'],
        'description': 'Tech/SaaS product visualization'
    },
    {
        'name': 'Abstract Tech Concept',
        'category': 'tech_saas',
        'template_text': 'Abstract digital illustration of {{technology_concept}}, geometric shapes, modern color palette, clean minimal style, technology-forward aesthetic, professional tech marketing',
        'variables': ['technology_concept'],
        'description': 'Abstract technology concept illustration'
    },
    {
        'name': 'Cloud/Network Visualization',
        'category': 'tech_saas',
        'template_text': 'Professional visualization of {{cloud_concept}}, interconnected nodes, network diagram style, modern tech aesthetic, blue and white color scheme, enterprise software marketing style',
        'variables': ['cloud_concept'],
        'description': 'Cloud computing/network visualization'
    },
    {
        'name': 'AI/Data Visualization',
        'category': 'tech_saas',
        'template_text': 'Futuristic AI and data visualization showing {{data_concept}}, neural network style, glowing elements, dark background, modern tech aesthetic, artificial intelligence theme',
        'variables': ['data_concept'],
        'description': 'AI and data-focused visualization'
    },

    # Category 7: Food/Restaurant
    {
        'name': 'Overhead Food Photography',
        'category': 'food_restaurant',
        'template_text': 'Appetizing food photography of {{dish}}, overhead flat-lay angle, natural daylight, fresh ingredients visible, garnished beautifully, restaurant-quality presentation, vibrant colors, professional food styling',
        'variables': ['dish'],
        'description': 'Top-down food photography'
    },
    {
        'name': 'Close-Up Food Detail',
        'category': 'food_restaurant',
        'template_text': 'Mouth-watering close-up of {{dish}}, detailed texture visible, steam rising, professional food photography, warm appetizing lighting, restaurant menu quality, culinary art presentation',
        'variables': ['dish'],
        'description': 'Detailed close-up food shot'
    },
    {
        'name': 'Restaurant Ambiance',
        'category': 'food_restaurant',
        'template_text': '{{dish}} served in elegant restaurant setting, ambient lighting, table setting visible, fine dining atmosphere, professional restaurant photography, upscale presentation, atmospheric mood',
        'variables': ['dish'],
        'description': 'Food with restaurant atmosphere'
    },
    {
        'name': 'Rustic Food Styling',
        'category': 'food_restaurant',
        'template_text': '{{dish}} with rustic presentation, wooden table surface, natural ingredients around, warm natural lighting, artisanal feel, home-cooked aesthetic, food blog style photography',
        'variables': ['dish'],
        'description': 'Rustic, artisanal food presentation'
    },

    # Category 8: Fashion/Apparel
    {
        'name': 'Fashion Product Shot',
        'category': 'fashion_apparel',
        'template_text': 'Fashion product photo of {{item}}, professional model wearing {{item}}, studio lighting, clean background, high-fashion editorial style, detailed fabric texture visible, e-commerce ready',
        'variables': ['item'],
        'description': 'Professional fashion product photography'
    },
    {
        'name': 'Editorial Fashion',
        'category': 'fashion_apparel',
        'template_text': 'High-fashion editorial photo featuring {{clothing_item}}, dramatic lighting, artistic composition, professional fashion photography, vogue-style aesthetic, striking pose, premium fashion magazine quality',
        'variables': ['clothing_item'],
        'description': 'Editorial fashion magazine style'
    },
    {
        'name': 'Lifestyle Fashion',
        'category': 'fashion_apparel',
        'template_text': 'Lifestyle fashion photo of person wearing {{outfit}}, natural environment, candid moment, street style photography, authentic fashion, real-world context, modern casual aesthetic',
        'variables': ['outfit'],
        'description': 'Casual lifestyle fashion photography'
    },
    {
        'name': 'Flat Lay Apparel',
        'category': 'fashion_apparel',
        'template_text': 'Flat lay fashion photo of {{clothing_items}}, overhead view, styled arrangement, clean background, professional product photography, e-commerce optimized, clothing details visible',
        'variables': ['clothing_items'],
        'description': 'Overhead flat lay of clothing'
    },
]


def seed_templates():
    """Populate database with prompt templates"""
    app = create_app()
    with app.app_context():
        print("🌱 Seeding prompt templates...")

        # Clear existing templates
        PromptTemplateModel.get_collection().delete_many({})

        # Insert templates
        count = 0
        for template_data in TEMPLATES:
            PromptTemplateModel.create(
                name=template_data['name'],
                category=template_data['category'],
                template_text=template_data['template_text'],
                variables=template_data['variables'],
                description=template_data['description']
            )
            count += 1

        print(f"✅ Successfully seeded {count} prompt templates")
        print(f"📊 Categories: {len(set(t['category'] for t in TEMPLATES))}")

        # Print category summary
        categories = {}
        for template in TEMPLATES:
            cat = template['category']
            categories[cat] = categories.get(cat, 0) + 1

        print("\n📋 Templates by category:")
        for cat, count in sorted(categories.items()):
            print(f"   - {cat}: {count} templates")


if __name__ == '__main__':
    seed_templates()
