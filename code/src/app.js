import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as cheerio from 'cheerio';

function App() {
    const [multiplier, setMultiplier] = useState(1);
    const [recipeURL, setRecipeURL] = useState('');
    const [loadingMessage, setLoadingMessage] = useState('');
    const [ingredients, setIngredients] = useState([
        { name: 'All-Purpose Flour (Sample)', quantity: 2, unit: 'cups' },
        { name: 'Cold Unsalted Butter (Sample)', quantity: 8, unit: 'tbsp' },
        { name: 'Baking Powder (Sample)', quantity: 1, unit: 'tbsp' }
    ]);
    const [constraints, setConstraints] = useState({});

    // helper: AI refinement logic
    const refineWithAI = async (rawText) => {
        const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
        if (!apiKey) return null;

        try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
            model: "gpt-3.5-turbo",
            messages: [{
                role: "system", 
                content: "Convert recipe ingredient text into a JSON object with keys: quantity (number), unit (string), and name (string). Convert all fractions to decimals. If no quantity is found, use 1."
            }, {
                role: "user", 
                content: rawText
            }],
            temperature: 0
            },
            { headers: { 'Authorization': `Bearer ${apiKey}` } }
        );
        return JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            return null;
        }
    };

    const parseIngredientLocal = (text) => {
        const match = text.match(/^(\d+\/?\d*)\s*(\w+)?\s*(.*)$/);
        if (match) {
        return {
            quantity: eval(match[1].replace('/', '/')) || 1,
            unit: match[2] || '',
            name: match[3] || text
        };
        }
        return { quantity: 1, unit: '', name: text };
    };

    // limiting ingredient logic
    // calculates maximum possible scale based on limiting ingredient
    const optimizeForPantry = (item, userAmount) => {
        if (item.quantity > 0) {
            const maxForThisIngredient = userAmount / item.quantity;
            
            const newConstraints = { 
                ...constraints, 
                [item.name]: maxForThisIngredient 
            };
            
            setConstraints(newConstraints);

            const lowestScale = Math.min(...Object.values(newConstraints));
            setMultiplier(lowestScale);
        }
    };
  
    const handleScrape = async () => {
        if (!recipeURL) return alert("Please paste a URL first! 🥧");
        setLoadingMessage('Connecting to kitchen... 🔍');
        setConstraints({});

        try {
            // fetch HTML using proxy to avoid CORS errors
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(recipeURL);
            const { data } = await axios.get(proxyUrl);
            
            // load HTML into Cheerio to search
            const $ = cheerio.load(data);
            let rawStrings = [];

            // search for <script> tag with the specific type "application/ld+json"
            setLoadingMessage('Reading recipe metadata... 📚');
            const ldJsonScript = $('script[type="application/ld+json"]').html();
            
            if (ldJsonScript) {
                const jsonData = JSON.parse(ldJsonScript);
                
                // find object where '@type' is 'Recipe'
                // (Recipes can be in a list, a graph, or the root object)
                const recipeData = Array.isArray(jsonData) 
                ? jsonData.find(obj => obj['@type'] === 'Recipe') 
                : jsonData['@graph'] 
                    ? jsonData['@graph'].find(obj => obj['@type'] === 'Recipe')
                    : jsonData['@type'] === 'Recipe' ? jsonData : null;

                if (recipeData && recipeData.recipeIngredient) {
                    rawStrings = recipeData.recipeIngredient;
                }
            }

            if (rawStrings.length === 0) {
                setLoadingMessage('Scanning page elements... 🖥️');
                
                // target common class names used by popular recipe plugins
                $('.recipe-ingredients li, .wprm-recipe-ingredient, .ingredients-item, .entry-content ul li').each((i, el) => {
                    const text = $(el).text().replace(/\s+/g, ' ').trim();
                    
                    // add if it starts with a number
                    if (text.match(/^\d/)) {
                        rawStrings.push(text);
                    }
                });
            }

            if (rawStrings.length > 0) {
                setLoadingMessage('Refining measurements with AI... ✨');
                const finalResults = await Promise.all(rawStrings.map(async (text) => {
                // Broad trigger for slashes, mixed numbers, or special symbols
                if (text.match(/\//) || text.match(/[¼½¾⅓⅔⅛⅜⅝⅞]/) || text.match(/\d+\s+\d+/)) {
                    const aiRes = await refineWithAI(text);
                    return aiRes ? aiRes : parseIngredientLocal(text);
                }
                return parseIngredientLocal(text);
                }));

                setIngredients(finalResults);
                setMultiplier(1);
            }
        } catch (error) {
            alert("Failed to fetch the recipe.");
        } finally {
            setLoadingMessage('');
        }
    };

    // UI
    const styles = {
        container: { padding: '40px 20px', maxWidth: '650px', margin: 'auto', backgroundColor: '#FFF9F5', minHeight: '100vh', color: '#5D4037', fontFamily: 'Arial, sans-serif' },
        card: { backgroundColor: '#FFFFFF', padding: '30px', borderRadius: '25px', boxShadow: '0 10px 25px rgba(220, 190, 180, 0.3)', border: '2px solid #F3E5F5' },
        input: { width: '100%', padding: '12px', borderRadius: '15px', border: '2px solid #FFECB3', marginBottom: '10px', boxSizing: 'border-box' },
        button: { backgroundColor: '#D81B60', color: 'white', border: 'none', padding: '15px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', width: '100%' },
        row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px', borderBottom: '1px solid #FCE4EC', transition: '0.3s' }
    };

    return (
        <div style={styles.container}>
        <div style={styles.card}>
            <h1 style={{ textAlign: 'center', color: '#D81B60' }}>🥐 Scone Scaler</h1>
            
            <section style={{ marginBottom: '30px' }}>
            <input type="text" placeholder="Paste recipe URL..." value={recipeURL} onChange={(e) => setRecipeURL(e.target.value)} style={styles.input} />
            <button onClick={handleScrape} disabled={!!loadingMessage} style={styles.button}>
                {loadingMessage ? loadingMessage : 'Import Recipe ✨'}
            </button>
            </section>

            <section style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Current Scale:</span>
                <strong>{multiplier.toFixed(2)}x</strong>
            </div>
            <input type="range" min="0.1" max="4" step="0.1" value={multiplier} onChange={(e) => setMultiplier(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#D81B60' }} />
            </section>

            <h3>Ingredients:</h3>
            {ingredients.map((item, index) => {
            // Visual feedback for the limiting ingredient
            const isLimiting = constraints[item.name] === multiplier && Object.keys(constraints).length > 0;
            
            return (
                <div key={index} style={{ ...styles.row, backgroundColor: isLimiting ? '#FFF3E0' : 'transparent' }}>
                <span style={{ flex: 1 }}>
                    <strong style={{ color: '#D81B60' }}>{(item.quantity * multiplier).toFixed(2)} {item.unit}</strong> {item.name}
                    {isLimiting && <div style={{ fontSize: '0.65rem', color: '#E65100', fontWeight: 'bold' }}>LIMITING FACTOR ⚠️</div>}
                </span>
                <button 
                    onClick={() => {
                    const val = prompt(`How much ${item.name} (${item.unit}) do you have in stock?`);
                    if (val) optimizeForPantry(item, parseFloat(val));
                    }} 
                    style={{ fontSize: '0.7rem', backgroundColor: '#FFF', borderRadius: '8px', padding: '6px 10px', border: '1px solid #FFECB3', cursor: 'pointer' }}
                >
                    Stock 🧺
                </button>
                </div>
            );
            })}
        </div>
        </div>
    );
}

export default App;