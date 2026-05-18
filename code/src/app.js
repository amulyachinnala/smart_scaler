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
    
    const handleScrape = async () => {
        if (!recipeURL) return alert("Please paste a URL first! 🥧");
        setLoadingMessage('Connecting to kitchen... 🔍');

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

            if (rawStrings.length > 0) {
                const parsed = rawStrings.map(text => parseIngredientLocal(text));
                setIngredients(parsed);
                setMultiplier(1);
                setConstraints({}); 
            } else {
                alert("Metadata not found on this site.");
            }
        } catch (error) {
            alert("Failed to fetch the recipe.");
        } finally {
            setLoadingMessage('');
        }
    };
}

export default App;